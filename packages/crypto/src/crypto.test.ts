import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { openToken, sealToken } from "./index.js";

const KEY = randomBytes(32); // stands in for the server master key
const TOKEN = "steam-refresh-token-abc123";

test("seal/open round-trips with the right key", () => {
	const sealed = sealToken(KEY, TOKEN);
	expect(openToken(KEY, sealed)).toBe(TOKEN);
	// nothing in the sealed record leaks the plaintext
	expect(JSON.stringify(sealed).includes(TOKEN)).toBe(false);
});

test("each seal uses a fresh DEK + nonces", () => {
	const a = sealToken(KEY, TOKEN);
	const b = sealToken(KEY, TOKEN);
	expect(a.encryptedToken).not.toBe(b.encryptedToken);
	expect(a.wrappedDek).not.toBe(b.wrappedDek);
});

test("a different key cannot open it", () => {
	const sealed = sealToken(KEY, TOKEN);
	expect(() => openToken(randomBytes(32), sealed)).toThrow();
});

test("tampering with the ciphertext is detected", () => {
	const sealed = sealToken(KEY, TOKEN);
	const flipped = Buffer.from(sealed.encryptedToken, "base64");
	flipped[0] ^= 0xff;
	expect(() => openToken(KEY, { ...sealed, encryptedToken: flipped.toString("base64") })).toThrow();
});
