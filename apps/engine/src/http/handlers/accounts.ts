import { HttpRouter, HttpServerRequest } from "@effect/platform";
import { account, db } from "@psg/db";
import { eq } from "drizzle-orm";
import { Effect, Either, Schema } from "effect";
import {
	type AccountConfigInput,
	addSteamAccount,
	unlockUser,
} from "../../auth/index.js";
import type { AppContext } from "../context.js";
import { badRequest, jsonResponse, notFound, unauthorized } from "../respond.js";
import { getSession } from "../session.js";

const AddBody = Schema.Struct({
	username: Schema.String,
	refreshToken: Schema.String,
	config: Schema.optional(Schema.Unknown),
});
const UnlockBody = Schema.Struct({ password: Schema.String });

type AccountRow = typeof account.$inferSelect;
// Never leak ciphertext, nonces, or legacy plaintext tokens to the client.
const sanitize = (a: AccountRow) => ({
	id: a.id,
	username: a.username,
	limit: a.limit,
	usage: a.usage,
	maxPrice: a.maxPrice,
	priceOptionsFlag: a.priceOptionsFlag,
	mode: a.mode,
	hasSealedToken: !!a.encryptedRefreshToken,
	cachedWalletBalance: a.cachedWalletBalance,
	cachedWalletCurrency: a.cachedWalletCurrency,
	cachedOwnedCount: a.cachedOwnedCount,
	cachedAt: a.cachedAt,
});

export const addAccount = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const kek = ctx.keys.get(session.sessionId);
		if (!kek)
			return yield* jsonResponse(
				{ error: "locked: unlock with your password first" },
				423,
			);

		const parsed = yield* Effect.either(
			HttpServerRequest.schemaBodyJson(AddBody),
		);
		if (Either.isLeft(parsed)) return yield* badRequest();
		const { username, refreshToken, config } = parsed.right;

		const created = yield* Effect.either(
			Effect.tryPromise(() =>
				addSteamAccount(
					session.userId,
					kek,
					username,
					refreshToken,
					(config ?? {}) as AccountConfigInput,
				),
			),
		);
		if (Either.isLeft(created))
			return yield* jsonResponse(
				{ error: "could not add account (duplicate username?)" },
				409,
			);
		return yield* jsonResponse(sanitize(created.right), 201);
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

export const unlock = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const parsed = yield* Effect.either(
			HttpServerRequest.schemaBodyJson(UnlockBody),
		);
		if (Either.isLeft(parsed)) return yield* badRequest();

		const kek = yield* Effect.tryPromise(() =>
			unlockUser(session.userId, parsed.right.password),
		);
		if (!kek) return yield* jsonResponse({ error: "invalid password" }, 401);
		ctx.keys.set(session.sessionId, kek);
		return yield* jsonResponse({ ok: true });
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
			Effect.tryPromise(() => ctx.jobs.startRefresh(accountId, session.sessionId)),
		);
		if (Either.isLeft(result))
			return yield* jsonResponse(
				{ error: String((result.left as Error)?.message ?? result.left) },
				423,
			);
		return yield* jsonResponse({ jobId: result.right }, 202);
	});
