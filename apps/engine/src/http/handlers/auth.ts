import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";
import { connectAccount, findOrCreateUser } from "../../auth/index.js";
import type { AppContext } from "../context.js";
import { jsonResponse, jsonWithCookie, notFound } from "../respond.js";
import { COOKIE_NAME, cookieOptions, getSession } from "../session.js";

// POST /auth/qr/start — begin a Steam QR login. If already signed in, the scan
// instead connects an additional account to the current user.
export const qrStart = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		const started = yield* Effect.tryPromise(() =>
			ctx.qr.start(session?.userId),
		);
		return yield* jsonResponse(started); // { qrId, challengeUrl }
	});

// GET /auth/qr/:qrId — poll status. On the first "authenticated" we finalize:
// fresh login → find/create the user + set a session cookie; add-account → just
// attach the scanned account to the signed-in user.
export const qrStatus = (ctx: AppContext) =>
	Effect.gen(function* () {
		const params = yield* HttpRouter.params;
		const entry = ctx.qr.get(params.qrId ?? "");
		if (!entry) return yield* notFound("unknown qr session");

		if (entry.status !== "authenticated" || !entry.result) {
			return yield* jsonResponse({ status: entry.status });
		}

		const { steamId, accountName, refreshToken } = entry.result;

		if (entry.initiatingUserId != null) {
			yield* Effect.promise(() =>
				connectAccount(entry.initiatingUserId!, steamId, accountName, refreshToken),
			);
			ctx.qr.consume(params.qrId ?? "");
			return yield* jsonResponse({ status: "authenticated" });
		}

		const user = yield* Effect.promise(() => findOrCreateUser(steamId));
		yield* Effect.promise(() =>
			connectAccount(user.id, steamId, accountName, refreshToken),
		);
		const sid = ctx.sessions.create(user.id);
		ctx.qr.consume(params.qrId ?? "");
		return yield* jsonWithCookie(
			{ status: "authenticated" },
			200,
			COOKIE_NAME,
			sid,
			cookieOptions,
		);
	});

export const logout = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (session) ctx.sessions.destroy(session.sessionId);
		return yield* jsonWithCookie({ ok: true }, 200, COOKIE_NAME, "", {
			...cookieOptions,
			maxAge: 0,
		});
	});
