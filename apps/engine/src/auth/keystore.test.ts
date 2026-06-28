import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyStore } from "./keystore.js";

test("stores and returns a KEK for a session", () => {
	const store = new KeyStore();
	const kek = Buffer.alloc(32, 7);
	store.set("sess-1", kek);
	assert.ok(store.get("sess-1")?.equals(kek));
	assert.equal(store.get("unknown"), null);
});

test("expires a KEK after the TTL", () => {
	let clock = 1000;
	const store = new KeyStore(100, () => clock);
	store.set("sess-1", Buffer.alloc(32, 7));
	clock = 1099;
	assert.ok(store.get("sess-1") !== null);
	clock = 1101;
	assert.equal(store.get("sess-1"), null);
});

test("wipe zeroes the key bytes and forgets the session", () => {
	const store = new KeyStore();
	const kek = Buffer.alloc(32, 7);
	store.set("sess-1", kek);
	store.wipe("sess-1");
	assert.equal(store.get("sess-1"), null);
	assert.ok(kek.equals(Buffer.alloc(32, 0))); // bytes zeroed in place
});

test("wipeAll clears every session", () => {
	const store = new KeyStore();
	store.set("a", Buffer.alloc(32, 1));
	store.set("b", Buffer.alloc(32, 2));
	store.wipeAll();
	assert.equal(store.get("a"), null);
	assert.equal(store.get("b"), null);
});
