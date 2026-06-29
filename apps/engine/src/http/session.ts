import { randomUUID } from "node:crypto";
import { HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";
import type { AppContext } from "./context.js";

export const COOKIE_NAME = "psg_session";

// httpOnly + SameSite=strict; Secure only in prod so local http dev still sends it.
export const cookieOptions = {
	httpOnly: true,
	sameSite: "strict",
	path: "/",
	secure: process.env.NODE_ENV === "production",
} as const;

export interface Session {
	userId: number;
}

/** In-memory web session id → userId. The KEK lives separately in KeyStore. */
export class SessionStore {
	private readonly sessions = new Map<string, Session>();

	create(userId: number): string {
		const id = randomUUID();
		this.sessions.set(id, { userId });
		return id;
	}
	get(id: string | undefined): Session | null {
		return id ? (this.sessions.get(id) ?? null) : null;
	}
	destroy(id: string | undefined): void {
		if (id) this.sessions.delete(id);
	}
}

export interface ActiveSession {
	sessionId: string;
	userId: number;
}

/** Resolve the current session from the request cookie (null if unauthenticated). */
export const getSession = (
	ctx: AppContext,
): Effect.Effect<ActiveSession | null, never, HttpServerRequest.HttpServerRequest> =>
	HttpServerRequest.HttpServerRequest.pipe(
		Effect.map((req) => {
			const sid = req.cookies[COOKIE_NAME];
			const session = ctx.sessions.get(sid);
			return session ? { sessionId: sid as string, userId: session.userId } : null;
		}),
	);
