import { expect, test } from "vitest";
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
	expect(await verifyPassword(PASSWORD, rec)).toBe(true);
	expect(await verifyPassword("wrong password", rec)).toBe(false);
});

test("password: salts and hash are independent and random", async () => {
	const a = await createPasswordRecord(PASSWORD);
	const b = await createPasswordRecord(PASSWORD);
	expect(a.saltAuth).not.toBe(b.saltAuth);
	expect(a.saltKek).not.toBe(b.saltKek);
	expect(a.authHash).not.toBe(b.authHash);
	expect(a.saltAuth).not.toBe(a.saltKek);
});

test("token: seal/open round-trips with the right KEK", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const kek = await deriveKek(PASSWORD, rec.saltKek);
	const sealed = sealToken(kek, TOKEN);
	expect(openToken(kek, sealed)).toBe(TOKEN);
	expect(JSON.stringify(sealed).includes(TOKEN)).toBe(false);
});

test("token: a KEK from the wrong password cannot open it", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const kek = await deriveKek(PASSWORD, rec.saltKek);
	const sealed = sealToken(kek, TOKEN);
	const wrongKek = await deriveKek("wrong password", rec.saltKek);
	expect(() => openToken(wrongKek, sealed)).toThrow();
});

test("token: tampering with the ciphertext is detected", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const kek = await deriveKek(PASSWORD, rec.saltKek);
	const sealed = sealToken(kek, TOKEN);
	const flipped = Buffer.from(sealed.encryptedToken, "base64");
	flipped[0] ^= 0xff;
	const tampered = { ...sealed, encryptedToken: flipped.toString("base64") };
	expect(() => openToken(kek, tampered)).toThrow();
});

test("token: KEK is deterministic for the same password + salt", async () => {
	const rec = await createPasswordRecord(PASSWORD);
	const k1 = await deriveKek(PASSWORD, rec.saltKek);
	const k2 = await deriveKek(PASSWORD, rec.saltKek);
	expect(k1.equals(k2)).toBe(true);
	expect(k1.length).toBe(32);
});
