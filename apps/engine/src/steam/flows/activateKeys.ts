import { activatedKey, db } from "@psg/db";
import { eq } from "drizzle-orm";
import { sleep } from "../lib/util.js";
import type { SteamSession } from "../session.js";
import type { ActivateConfig } from "../types.js";

export const activateKeys = async (
	session: SteamSession,
	config: ActivateConfig,
): Promise<void> =>
	// biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
	new Promise<void>(async (resolve) => {
		let successCount = 0;
		let failedCount = 0;
		let skippedCount = 0;
		let autoRetryOnRateLimit = false;

		session.progress.info(`Starting activation of ${config.keys.length} keys...`);

		// Pre-filter keys: remove already activated ones and invalid formats
		// Extract key pattern from line (ignoring surrounding text)
		const keyRegex =
			/([A-Z0-9]{4,5}-[A-Z0-9]{4,5}-[A-Z0-9]{4,5}(-[A-Z0-9]{4,5}(-[A-Z0-9]{4,5})?)?)/i;
		const keysToProcess: string[] = [];
		let alreadyActivatedCount = 0;
		let invalidFormatCount = 0;
		const invalidLines: string[] = [];

		for (const rawKey of config.keys) {
			const line = rawKey.trim();

			if (!line) {
				continue;
			}

			// Try to extract key from the line
			const match = line.match(keyRegex);
			if (!match || !match[0]) {
				invalidFormatCount += 1;
				invalidLines.push(line);
				continue;
			}

			const key = match[0];

			// isKeyActivated(key) -> boolean
			const _k = (
				await db.select().from(activatedKey).where(eq(activatedKey.productKey, key))
			)[0];
			const alreadyActivated = _k != null && _k.success === true;
			if (alreadyActivated) {
				alreadyActivatedCount += 1;
				continue;
			}

			keysToProcess.push(key);
		}

		if (alreadyActivatedCount > 0) {
			session.progress.info(`Skipped ${alreadyActivatedCount} already activated keys`);
		}
		if (invalidFormatCount > 0) {
			session.progress.info(`Skipped ${invalidFormatCount} invalid key formats:`);
			invalidLines.forEach((line, idx) => {
				session.progress.warn(`  [${idx + 1}] ${line}`);
			});
		}

		session.progress.info(`Processing ${keysToProcess.length} keys...`);

		for (let i = 0; i < keysToProcess.length; i += 1) {
			const key = keysToProcess[i];

			const response = session.responseToJSON(
				(await session.postRequest(
					"https://store.steampowered.com/account/ajaxregisterkey/",
					{
						product_key: key,
						sessionid: session.sessionId,
					},
					{
						Cookie: session.cookies.join("; "),
						"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
						Origin: "https://store.steampowered.com",
						Referer: "https://store.steampowered.com/account/registerkey",
					},
				)) as string,
			) as any;

			// If response is false, it means we got a network error or rate limit
			// Don't mark as failed, just skip and let user retry later
			if (response === false) {
				skippedCount += 1;
				session.progress.warn(
					`[${i + 1}/${keysToProcess.length}] Network error or rate limit for "${key}" - skipping without marking as used`,
				);
				// eslint-disable-next-line no-continue
				continue;
			}

			const purchaseResultDetails = response?.purchase_result_details;
			const packageId =
				response?.purchase_receipt_info?.line_items?.[0]?.packageid?.toString() ||
				null;
			const lineItemDescription =
				response?.purchase_receipt_info?.line_items?.[0]?.line_item_description ||
				"Unknown";

			// success: 1 = successfully activated
			if (response?.success === 1) {
				successCount += 1;
				session.progress.info(
					`[${i + 1}/${keysToProcess.length}] Successfully activated "${key}": ${lineItemDescription} (${packageId || "Unknown"})`,
				);

				// Store as successful activation
				await db
					.insert(activatedKey)
					.values({
						productKey: key,
						accountId: config.accountId,
						success: true,
						packageId,
						errorMessage: null,
					})
					.onConflictDoUpdate({
						target: activatedKey.productKey,
						set: {
							accountId: config.accountId,
							success: true,
							packageId,
							errorMessage: null,
							activatedAt: new Date(),
						},
					})
					.returning();
			} else if (purchaseResultDetails === 9) {
				// Case 9: Already owns the product - key is consumed
				successCount += 1;
				session.progress.info(
					`[${i + 1}/${keysToProcess.length}] Already owned "${key}": ${lineItemDescription} (${packageId || "Unknown"})`,
				);

				// Store as activated (key is consumed)
				await db
					.insert(activatedKey)
					.values({
						productKey: key,
						accountId: config.accountId,
						success: true,
						packageId,
						errorMessage: "Already owned",
					})
					.onConflictDoUpdate({
						target: activatedKey.productKey,
						set: {
							accountId: config.accountId,
							success: true,
							packageId,
							errorMessage: "Already owned",
							activatedAt: new Date(),
						},
					})
					.returning();
			} else if (purchaseResultDetails === 53) {
				// Case 53: Rate limit exceeded
				session.progress.warn(
					`[${i + 1}/${keysToProcess.length}] Rate limit exceeded for "${key}"`,
				);

				// If first time hitting rate limit, ask user if they want to wait
				if (!autoRetryOnRateLimit) {
					// TODO(phase4): make this an explicit job param
					session.progress.info(
						"Rate limit hit! Proceeding to wait 1 hour and retry (assumed).",
					);

					// User agreed to wait, set flag for future rate limits
					autoRetryOnRateLimit = true;
				}

				// Wait 1 hour
				session.progress.info("Waiting 1 hour before retrying...");
				await sleep(60 * 60 * 1000); // 1 hour in milliseconds
				session.progress.info("Retrying activation...");

				// Retry the same key (decrement i so the loop will retry this index)
				i -= 1;
				// eslint-disable-next-line no-continue
				continue;
			} else if (purchaseResultDetails === 15) {
				// Case 15: Already activated by different account - key is consumed
				failedCount += 1;
				session.progress.error(
					`[${i + 1}/${keysToProcess.length}] Already used by another account: "${key}"`,
				);

				// Store as activated/failed (key is consumed, can't be used again)
				await db
					.insert(activatedKey)
					.values({
						productKey: key,
						accountId: config.accountId,
						success: true,
						packageId,
						errorMessage: "Already activated by different account",
					})
					.onConflictDoUpdate({
						target: activatedKey.productKey,
						set: {
							accountId: config.accountId,
							success: true,
							packageId,
							errorMessage: "Already activated by different account",
							activatedAt: new Date(),
						},
					})
					.returning();
			} else {
				// Other errors (invalid key, region lock, etc.)
				failedCount += 1;

				const errorMessages: Record<number, string> = {
					14: "Invalid product code",
					16: "Batched request timeout",
					13: "Not available in this region",
					24: "Requires ownership of another product",
					36: "Requires PlayStation 3 activation",
					50: "Steam Wallet code (use different page)",
					4: "Unknown error (4)",
				};

				const errorMessage =
					errorMessages[purchaseResultDetails] ||
					`Unexpected error (code: ${purchaseResultDetails})`;

				session.progress.error(
					`[${i + 1}/${keysToProcess.length}] Failed "${key}": ${errorMessage}`,
				);

				// For timeout (16), don't mark as used
				if (purchaseResultDetails === 16) {
					skippedCount += 1;
					failedCount -= 1;
					// eslint-disable-next-line no-continue
					continue;
				}

				// Store the failed activation
				await db
					.insert(activatedKey)
					.values({
						productKey: key,
						accountId: config.accountId,
						success: false,
						packageId,
						errorMessage,
					})
					.onConflictDoUpdate({
						target: activatedKey.productKey,
						set: {
							accountId: config.accountId,
							success: false,
							packageId,
							errorMessage,
							activatedAt: new Date(),
						},
					})
					.returning();
			}

			// Add a small delay to avoid rate limiting
			await sleep(1000);
		}

		session.progress.info(
			`Activation complete! Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`,
		);
		resolve();
	});
