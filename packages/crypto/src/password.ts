import { randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { b64, fromB64 } from "./aes.js";
import { ARGON2_PARAMS, type PasswordRecord } from "./types.js";

const SALT_BYTES = 16;
const KEK_BYTES = 32; // AES-256 key

// Raw Argon2id derivation with an explicit salt. Used twice per password with
// two independent salts: once for the stored auth hash, once for the KEK.
const deriveRaw = (
	password: string,
	salt: Buffer,
	hashLength = KEK_BYTES,
): Promise<Buffer> =>
	argon2.hash(password, {
		type: argon2.argon2id,
		...ARGON2_PARAMS,
		salt,
		hashLength,
		raw: true,
	}) as Promise<Buffer>;

/** Register: derive a fresh auth hash + two salts from the password. */
export const createPasswordRecord = async (
	password: string,
): Promise<PasswordRecord> => {
	const saltAuth = randomBytes(SALT_BYTES);
	const saltKek = randomBytes(SALT_BYTES);
	const authHash = await deriveRaw(password, saltAuth);
	return {
		saltAuth: b64(saltAuth),
		saltKek: b64(saltKek),
		authHash: b64(authHash),
	};
};

/** Login: constant-time check of the submitted password against the stored hash. */
export const verifyPassword = async (
	password: string,
	rec: Pick<PasswordRecord, "saltAuth" | "authHash">,
): Promise<boolean> => {
	const expected = fromB64(rec.authHash);
	const actual = await deriveRaw(password, fromB64(rec.saltAuth));
	return actual.length === expected.length && timingSafeEqual(actual, expected);
};

/** Derive the Key-Encryption-Key. Held in memory only, never persisted. */
export const deriveKek = (password: string, saltKek: string): Promise<Buffer> =>
	deriveRaw(password, fromB64(saltKek), KEK_BYTES);
