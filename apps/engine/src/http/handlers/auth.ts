import { HttpServerRequest } from "@effect/platform";
import { Effect, Either, Schema } from "effect";
import { authenticate, registerUser } from "../../auth/index.js";
import type { AppContext } from "../context.js";
import { badRequest, jsonResponse, jsonWithCookie } from "../respond.js";
import { COOKIE_NAME, cookieOptions, getSession } from "../session.js";

const Credentials = Schema.Struct({
	email: Schema.String,
	password: Schema.String,
});

export const register = (ctx: AppContext) =>
	Effect.gen(function* () {
		const parsed = yield* Effect.either(
			HttpServerRequest.schemaBodyJson(Credentials),
		);
		if (Either.isLeft(parsed)) return yield* badRequest();
		const { email, password } = parsed.right;

		const created = yield* Effect.either(
			Effect.tryPromise(() => registerUser(email, password)),
		);
		if (Either.isLeft(created))
			return yield* jsonResponse({ error: "email already registered" }, 409);

		// auto-login: derive KEK + mint session
		const auth = yield* Effect.tryPromise(() => authenticate(email, password));
		if (!auth) return yield* jsonResponse({ error: "registration failed" }, 500);
		const sid = ctx.sessions.create(auth.user.id);
		ctx.keys.set(sid, auth.kek);
		return yield* jsonWithCookie(
			{ id: auth.user.id, email: auth.user.email },
			201,
			COOKIE_NAME,
			sid,
			cookieOptions,
		);
	});

export const login = (ctx: AppContext) =>
	Effect.gen(function* () {
		const parsed = yield* Effect.either(
			HttpServerRequest.schemaBodyJson(Credentials),
		);
		if (Either.isLeft(parsed)) return yield* badRequest();
		const { email, password } = parsed.right;

		const auth = yield* Effect.either(
			Effect.tryPromise(() => authenticate(email, password)),
		);
		if (Either.isLeft(auth) || !auth.right)
			return yield* jsonResponse({ error: "invalid credentials" }, 401);

		const sid = ctx.sessions.create(auth.right.user.id);
		ctx.keys.set(sid, auth.right.kek);
		return yield* jsonWithCookie(
			{ id: auth.right.user.id, email: auth.right.user.email },
			200,
			COOKIE_NAME,
			sid,
			cookieOptions,
		);
	});

export const logout = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (session) {
			ctx.keys.wipe(session.sessionId);
			ctx.sessions.destroy(session.sessionId);
		}
		return yield* jsonWithCookie({ ok: true }, 200, COOKIE_NAME, "", {
			...cookieOptions,
			maxAge: 0,
		});
	});
