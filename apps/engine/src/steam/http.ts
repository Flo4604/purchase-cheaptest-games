import { SteamRateLimited, SteamRequestFailed } from "@psg/core";
import axios from "axios";
import {
	Context,
	type Duration,
	Effect,
	Layer,
	RateLimiter,
	Schedule,
} from "effect";

// Effect hardening for every outbound Steam request (WEBAPP_PLAN §5):
//   - a RateLimiter paces calls (replaces the old scattered `sleep(75)`s)
//   - retry with exponential backoff + jitter on transient failures
//   - typed errors (SteamRateLimited / SteamRequestFailed) from @psg/core
// The session runs these effects through a ManagedRuntime and maps terminal
// failures back to the legacy `false`/`undefined` contract so flows are unchanged.

export interface SteamHttpConfig {
	/** Max requests per `interval` (token-bucket). */
	readonly limit: number;
	readonly interval: Duration.DurationInput;
	/** Retry attempts after the first try. */
	readonly maxRetries: number;
	/** Base backoff delay; doubles each attempt, jittered. */
	readonly baseDelay: Duration.DurationInput;
}

export const defaultHttpConfig: SteamHttpConfig = {
	limit: 10,
	interval: "1 seconds",
	maxRetries: 5,
	baseDelay: "250 millis",
};

export type SteamRequestError = SteamRateLimited | SteamRequestFailed;

const isTransient = (e: SteamRequestError): boolean =>
	e._tag === "SteamRateLimited" || e._tag === "SteamRequestFailed";

const retrySchedule = (config: SteamHttpConfig) =>
	Schedule.exponential(config.baseDelay, 2).pipe(
		Schedule.jittered,
		Schedule.intersect(Schedule.recurs(config.maxRetries)),
	);

// The shared RateLimiter, provided as a scoped service.
export class SteamLimiter extends Context.Tag("SteamLimiter")<
	SteamLimiter,
	RateLimiter.RateLimiter
>() {}

export const SteamLimiterLive = (config: SteamHttpConfig) =>
	Layer.scoped(
		SteamLimiter,
		RateLimiter.make({
			limit: config.limit,
			interval: config.interval,
			algorithm: "token-bucket",
		}),
	);

// ── single-attempt request effects ────────────────────────────────────────

const classifyMessage = (url: string, err: { message?: string }) =>
	err.message === "HTTP error 429"
		? new SteamRateLimited({ endpoint: url })
		: new SteamRequestFailed({ endpoint: url, cause: err });

export const communityGet = (
	community: any,
	url: string,
	headers: Record<string, unknown>,
	debug = false,
): Effect.Effect<unknown, SteamRequestError> =>
	Effect.async<unknown, SteamRequestError>((resume) => {
		community.httpRequestGet(
			url,
			headers,
			(err: { message?: string } | null, response: unknown, body: unknown) => {
				if (err) {
					resume(Effect.fail(classifyMessage(url, err)));
					return;
				}
				if (debug) console.log({ response });
				resume(Effect.succeed(body));
			},
		);
	});

export const communityPost = (
	community: any,
	url: string,
	data: unknown,
	headers: Record<string, unknown>,
	debug = false,
): Effect.Effect<unknown, SteamRequestError> =>
	Effect.async<unknown, SteamRequestError>((resume) => {
		community.httpRequestPost(
			url,
			{ form: data, headers },
			(err: { message?: string } | null, response: unknown, body: unknown) => {
				if (err) {
					resume(Effect.fail(classifyMessage(url, err)));
					return;
				}
				if (debug) console.log({ response });
				resume(Effect.succeed(body));
			},
		);
	});

export const axiosGet = (
	url: string,
	params?: unknown,
): Effect.Effect<unknown, SteamRequestError> =>
	Effect.tryPromise({
		try: () => axios.get(url, params as object).then((r) => r.data),
		catch: (cause) => {
			const status = (cause as { response?: { status?: number } })?.response
				?.status;
			return status === 429
				? new SteamRateLimited({ endpoint: url, retryAfterMs: undefined })
				: new SteamRequestFailed({ endpoint: url, status, cause });
		},
	});

// ── hardening wrapper ──────────────────────────────────────────────────────

/** Pace through the RateLimiter, then retry transient failures with backoff. */
export const harden = <A>(
	attempt: Effect.Effect<A, SteamRequestError>,
	config: SteamHttpConfig,
): Effect.Effect<A, SteamRequestError, SteamLimiter> =>
	Effect.gen(function* () {
		const limiter = yield* SteamLimiter;
		return yield* limiter(attempt).pipe(
			Effect.retry({ schedule: retrySchedule(config), while: isTransient }),
		);
	});
