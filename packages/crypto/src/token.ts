import { randomBytes } from "node:crypto";
import { aesDecrypt, aesEncrypt, b64, fromB64 } from "./aes.js";
import type { SealedToken } from "./types.js";

const DEK_BYTES = 32; // AES-256 data-encryption key

/**
 * Envelope-encrypt a Steam refresh token:
 *   random DEK ──AES-256-GCM──▶ encrypted token
 *   KEK        ──AES-256-GCM──▶ wrapped DEK
 * The DEK indirection means a password change only re-wraps the DEK; the token
 * ciphertext is untouched.
 */
export const sealToken = (kek: Buffer, refreshToken: string): SealedToken => {
	const dek = randomBytes(DEK_BYTES);
	const token = aesEncrypt(dek, Buffer.from(refreshToken, "utf8"));
	const wrapped = aesEncrypt(kek, dek);
	return {
		wrappedDek: b64(wrapped.blob),
		dekNonce: b64(wrapped.nonce),
		encryptedToken: b64(token.blob),
		tokenNonce: b64(token.nonce),
	};
};

/** Unwrap the DEK with the KEK, then decrypt the refresh token. Throws if the
 * KEK is wrong or the ciphertext was tampered with (GCM tag mismatch). */
export const openToken = (kek: Buffer, sealed: SealedToken): string => {
	const dek = aesDecrypt(
		kek,
		fromB64(sealed.dekNonce),
		fromB64(sealed.wrappedDek),
	);
	const token = aesDecrypt(
		dek,
		fromB64(sealed.tokenNonce),
		fromB64(sealed.encryptedToken),
	);
	return token.toString("utf8");
};
