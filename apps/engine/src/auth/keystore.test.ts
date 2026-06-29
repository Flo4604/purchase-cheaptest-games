import { expect, test } from "vitest";
import { KeyStore } from "./keystore.js";

test("stores and returns a KEK for a session", () => {
	const store = new KeyStore();
	const kek = Buffer.alloc(32, 7);
	store.set("sess-1", kek);
	expect(store.get("sess-1")?.equals(kek)).toBe(true);
	expect(store.get("unknown")).toBeNull();
});

test("expires a KEK after the TTL", () => {
	let clock = 1000;
	const store = new KeyStore(100, () => clock);
	store.set("sess-1", Buffer.alloc(32, 7));
	clock = 1099;
	expect(store.get("sess-1")).not.toBeNull();
	clock = 1101;
	expect(store.get("sess-1")).toBeNull();
});

test("wipe zeroes the key bytes and forgets the session", () => {
	const store = new KeyStore();
	const kek = Buffer.alloc(32, 7);
	store.set("sess-1", kek);
	store.wipe("sess-1");
	expect(store.get("sess-1")).toBeNull();
	expect(kek.equals(Buffer.alloc(32, 0))).toBe(true); // bytes zeroed in place
});

test("wipeAll clears every session", () => {
	const store = new KeyStore();
	store.set("a", Buffer.alloc(32, 1));
	store.set("b", Buffer.alloc(32, 2));
	store.wipeAll();
	expect(store.get("a")).toBeNull();
	expect(store.get("b")).toBeNull();
});
