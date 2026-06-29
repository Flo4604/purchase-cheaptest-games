import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { cookieOptions } from "./session.js";

type CookieOptions = Parameters<typeof HttpServerResponse.setCookie>[3];

// json() / setCookie() only fail on serialization/invalid-cookie, which can't
// happen for our plain payloads — orDie keeps the handler error channel clean.
export const jsonResponse = (
	body: unknown,
	status = 200,
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
	HttpServerResponse.json(body, { status }).pipe(Effect.orDie);

export const jsonWithCookie = (
	body: unknown,
	status: number,
	name: string,
	value: string,
	options: CookieOptions = cookieOptions,
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
	HttpServerResponse.json(body, { status }).pipe(
		Effect.flatMap((res) => HttpServerResponse.setCookie(res, name, value, options)),
		Effect.orDie,
	);

export const unauthorized = () => jsonResponse({ error: "unauthorized" }, 401);
export const badRequest = (message = "invalid request body") =>
	jsonResponse({ error: message }, 400);
export const notFound = (message = "not found") =>
	jsonResponse({ error: message }, 404);
