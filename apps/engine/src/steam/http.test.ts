import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
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

test("classifies a 429 as SteamRateLimited", async () => {
	const community = fakeCommunity((cb) => cb({ message: "HTTP error 429" }, null, null));
	const res = await Effect.runPromise(
		Effect.either(communityGet(community, "http://x", {})),
	);
	assert.ok(Either.isLeft(res));
	assert.equal(res.left._tag, "SteamRateLimited");
});

test("classifies other errors as SteamRequestFailed", async () => {
	const community = fakeCommunity((cb) => cb({ message: "ECONNRESET" }, null, null));
	const res = await Effect.runPromise(
		Effect.either(communityGet(community, "http://x", {})),
	);
	assert.ok(Either.isLeft(res));
	assert.equal(res.left._tag, "SteamRequestFailed");
});

test("retries transient failures, then succeeds", async () => {
	let calls = 0;
	const community = fakeCommunity((cb) => {
		calls += 1;
		if (calls < 3) cb({ message: "HTTP error 429" }, null, null);
		else cb(null, null, "OK");
	});
	const body = await Effect.runPromise(
		Effect.provide(
			harden(communityGet(community, "http://x", {}), { ...fastConfig, maxRetries: 5 }),
			SteamLimiterLive(fastConfig),
		),
	);
	assert.equal(body, "OK");
	assert.equal(calls, 3); // 2 failures + 1 success
});

test("gives up after maxRetries on persistent failure", async () => {
	let calls = 0;
	const community = fakeCommunity((cb) => {
		calls += 1;
		cb({ message: "HTTP error 429" }, null, null);
	});
	const cfg = { ...fastConfig, maxRetries: 3 };
	const res = await Effect.runPromise(
		Effect.either(
			Effect.provide(
				harden(communityGet(community, "http://x", {}), cfg),
				SteamLimiterLive(cfg),
			),
		),
	);
	assert.ok(Either.isLeft(res));
	assert.equal(res.left._tag, "SteamRateLimited");
	assert.equal(calls, 4); // 1 initial attempt + 3 retries
});
