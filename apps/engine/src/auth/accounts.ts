import { openToken, sealToken } from "@psg/crypto";
import { account, db } from "@psg/db";
import { and, eq } from "drizzle-orm";
import { MASTER_KEY } from "./serverKey.js";

export type Account = typeof account.$inferSelect;

/** Connect (or re-link) a Steam account for a user: envelope-encrypt the refresh
 * token under the server master key. Upserts by (userId, steamId). */
export const connectAccount = async (
	userId: number,
	steamId: string,
	username: string,
	refreshToken: string,
): Promise<Account> => {
	const sealed = sealToken(MASTER_KEY, refreshToken);
	const tokenCols = {
		wrappedDek: sealed.wrappedDek,
		dekNonce: sealed.dekNonce,
		encryptedRefreshToken: sealed.encryptedToken,
		tokenNonce: sealed.tokenNonce,
	};

	const existing = (
		await db
			.select()
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.steamId, steamId)))
	)[0];

	const rows = existing
		? await db
				.update(account)
				.set({ username, ...tokenCols })
				.where(eq(account.id, existing.id))
				.returning()
		: await db
				.insert(account)
				.values({ userId, steamId, username, ...tokenCols })
				.returning();
	return rows[0] as Account;
};

type SealedColumns = Pick<
	Account,
	"wrappedDek" | "dekNonce" | "encryptedRefreshToken" | "tokenNonce"
>;

/** Decrypt an account's Steam refresh token with the server master key. */
export const getAccountRefreshToken = (acct: SealedColumns): string => {
	if (
		!acct.wrappedDek ||
		!acct.dekNonce ||
		!acct.encryptedRefreshToken ||
		!acct.tokenNonce
	) {
		throw new Error("account has no sealed refresh token");
	}
	return openToken(MASTER_KEY, {
		wrappedDek: acct.wrappedDek,
		dekNonce: acct.dekNonce,
		encryptedToken: acct.encryptedRefreshToken,
		tokenNonce: acct.tokenNonce,
	});
};

/** Re-seal a rotated refresh token (steam-session refresh) under the master key. */
export const updateAccountToken = async (
	accountId: number,
	refreshToken: string,
): Promise<void> => {
	const sealed = sealToken(MASTER_KEY, refreshToken);
	await db
		.update(account)
		.set({
			wrappedDek: sealed.wrappedDek,
			dekNonce: sealed.dekNonce,
			encryptedRefreshToken: sealed.encryptedToken,
			tokenNonce: sealed.tokenNonce,
		})
		.where(eq(account.id, accountId));
};
