import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createPasswordRecord,
	deriveKek,
	openToken,
	sealToken,
	verifyPassword,
} from "./index.js";

const PASSWORD = "correct horse battery staple";
const TOKEN = "steam-refresh-token-abc123";

test("password: correct password verifies, wrong one does not", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	assert.equal(await verifyPassword(PASSWORD, rec), true);
	assert.equal(await verifyPassword("wrong password", rec), false);
});

test("password: salts and hash are independent and random", async () => {
	const a = await createPasswordRecord(PASSWORD);
	const b = await createPasswordRecord(PASSWORD);
	// same password, fresh salts -> different stored material every time
	assert.notEqual(a.saltAuth, b.saltAuth);
	assert.notEqual(a.saltKek, b.saltKek);
	assert.notEqual(a.authHash, b.authHash);
	assert.notEqual(a.saltAuth, a.saltKek);
});

test("token: seal/open round-trips with the right KEK", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const kek = await deriveKek(PASSWORD, rec.saltKek);
	const sealed = sealToken(kek, TOKEN);
	assert.equal(openToken(kek, sealed), TOKEN);
	// nothing in the sealed record leaks the plaintext
	assert.ok(!JSON.stringify(sealed).includes(TOKEN));
});

test("token: a KEK from the wrong password cannot open it", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const kek = await deriveKek(PASSWORD, rec.saltKek);
	const sealed = sealToken(kek, TOKEN);
	const wrongKek = await deriveKek("wrong password", rec.saltKek);
	assert.throws(() => openToken(wrongKek, sealed));
});

test("token: tampering with the ciphertext is detected", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const kek = await deriveKek(PASSWORD, rec.saltKek);
	const sealed = sealToken(kek, TOKEN);
	const flipped = Buffer.from(sealed.encryptedToken, "base64");
	flipped[0] ^= 0xff;
	const tampered = { ...sealed, encryptedToken: flipped.toString("base64") };
	assert.throws(() => openToken(kek, tampered));
});

test("token: KEK is deterministic for the same password + salt", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const k1 = await deriveKek(PASSWORD, rec.saltKek);
	const k2 = await deriveKek(PASSWORD, rec.saltKek);
	assert.ok(k1.equals(k2));
	assert.equal(k1.length, 32);
});
