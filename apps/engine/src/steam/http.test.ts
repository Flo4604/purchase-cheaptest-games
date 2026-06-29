import { it } from "@effect/vitest";
import { Effect, Either, Fiber, TestClock } from "effect";
import { expect } from "vitest";
import {
	communityGet,
	defaultHttpConfig,
	harden,
	SteamLimiterLive,
} from "./http.js";

type Cb = (err: unknown, res: unknown, body: unknown) => void;
const fakeCommunity = (handler: (cb: Cb) => void) => ({
	httpRequestGet: (_url: string, _headers: unknown, cb: Cb) => handler(cb),
});

const fastConfig = {
	...defaultHttpConfig,
	baseDelay: "1 millis" as const,
	limit: 1000,
	interval: "1 seconds" as const,
};

it.effect("classifies a 429 as SteamRateLimited", () =>
	Effect.gen(function* () {
		const community = fakeCommunity((cb) =>
			cb({ message: "HTTP error 429" }, null, null),
		);
		const res = yield* Effect.either(communityGet(community, "http://x", {}));
		expect(Either.isLeft(res)).toBe(true);
		if (Either.isLeft(res)) expect(res.left._tag).toBe("SteamRateLimited");
	}),
);

it.effect("classifies other errors as SteamRequestFailed", () =>
	Effect.gen(function* () {
		const community = fakeCommunity((cb) =>
			cb({ message: "ECONNRESET" }, null, null),
		);
		const res = yield* Effect.either(communityGet(community, "http://x", {}));
		expect(Either.isLeft(res)).toBe(true);
		if (Either.isLeft(res)) expect(res.left._tag).toBe("SteamRequestFailed");
	}),
);

it.effect("retries transient failures, then succeeds", () =>
	Effect.gen(function* () {
		let calls = 0;
		const community = fakeCommunity((cb) => {
			calls += 1;
			if (calls < 3) cb({ message: "HTTP error 429" }, null, null);
			else cb(null, null, "OK");
		});
		const cfg = { ...fastConfig, maxRetries: 5 };
		// Fork so we can drive the (virtual) TestClock past each backoff window.
		const fiber = yield* Effect.fork(
			Effect.provide(
				harden(communityGet(community, "http://x", {}), cfg),
				SteamLimiterLive(cfg),
			),
		);
		yield* TestClock.adjust("1 minute");
		const body = yield* Fiber.join(fiber);
		expect(body).toBe("OK");
		expect(calls).toBe(3); // 2 failures + 1 success
	}),
);

it.effect("gives up after maxRetries on persistent failure", () =>
	Effect.gen(function* () {
		let calls = 0;
		const community = fakeCommunity((cb) => {
			calls += 1;
			cb({ message: "HTTP error 429" }, null, null);
		});
		const cfg = { ...fastConfig, maxRetries: 3 };
		// Fork the Either-wrapped effect (so the fiber never "fails"), drive the
		// clock past all backoffs, then join and inspect the result.
		const fiber = yield* Effect.fork(
			Effect.either(
				Effect.provide(
					harden(communityGet(community, "http://x", {}), cfg),
					SteamLimiterLive(cfg),
				),
			),
		);
		yield* TestClock.adjust("1 minute");
		const res = yield* Fiber.join(fiber);
		expect(Either.isLeft(res)).toBe(true);
		if (Either.isLeft(res)) expect(res.left._tag).toBe("SteamRateLimited");
		expect(calls).toBe(4); // 1 initial + 3 retries
	}),
);
