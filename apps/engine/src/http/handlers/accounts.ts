import { HttpRouter } from "@effect/platform";
import { account, db } from "@psg/db";
import { eq } from "drizzle-orm";
import { Effect, Either } from "effect";
import type { AppContext } from "../context.js";
import { jsonResponse, notFound, unauthorized } from "../respond.js";
import { getSession } from "../session.js";

type AccountRow = typeof account.$inferSelect;
// Never leak ciphertext / nonces to the client.
const sanitize = (a: AccountRow) => ({
	id: a.id,
	steamId: a.steamId,
	username: a.username,
	limit: a.limit,
	usage: a.usage,
	maxPrice: a.maxPrice,
	priceOptionsFlag: a.priceOptionsFlag,
	mode: a.mode,
	cachedWalletBalance: a.cachedWalletBalance,
	cachedWalletCurrency: a.cachedWalletCurrency,
	cachedOwnedCount: a.cachedOwnedCount,
	cachedAt: a.cachedAt,
});

export const listAccounts = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const rows = yield* Effect.promise(() =>
			db.select().from(account).where(eq(account.userId, session.userId)),
		);
		return yield* jsonResponse(rows.map(sanitize));
	});

// Kick off a refresh job (login → wallet + owned-count → cache on the row).
export const refresh = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const params = yield* HttpRouter.params;
		const accountId = Number(params.id);
		const acct = yield* Effect.promise(() =>
			db
				.select()
				.from(account)
				.where(eq(account.id, accountId))
				.then((r) => r[0] ?? null),
		);
		if (!acct || acct.userId !== session.userId)
			return yield* notFound("account not found");
		const result = yield* Effect.either(
			Effect.tryPromise(() => ctx.jobs.startRefresh(accountId)),
		);
		if (Either.isLeft(result))
			return yield* jsonResponse(
				{ error: String((result.left as Error)?.message ?? result.left) },
				500,
			);
		return yield* jsonResponse({ jobId: result.right }, 202);
	});
