import { Data } from "effect";

// Typed, tagged errors for the Steam engine. Replace the CLI's ad-hoc throws so
// callers can match on `_tag` and Effect's retry/catch can target them.

export class SteamRateLimited extends Data.TaggedError("SteamRateLimited")<{
	readonly retryAfterMs?: number;
	readonly endpoint?: string;
}> {}

export class SteamAuthExpired extends Data.TaggedError("SteamAuthExpired")<{
	readonly accountId?: number;
}> {}

export class SteamRequestFailed extends Data.TaggedError("SteamRequestFailed")<{
	readonly endpoint: string;
	readonly status?: number;
	readonly cause?: unknown;
}> {}

// Sentinel for Valve SSR/markup drift — alert loudly (Sentry) when this fires.
export class SsrParseError extends Data.TaggedError("SsrParseError")<{
	readonly url: string;
	readonly reason: string;
}> {}
