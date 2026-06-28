import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM primitives. A GCM "blob" is ciphertext || 16-byte auth tag, so a
// single field carries both; the nonce is stored alongside it.

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export const b64 = (buf: Buffer): string => buf.toString("base64");
export const fromB64 = (s: string): Buffer => Buffer.from(s, "base64");

export const aesEncrypt = (
	key: Buffer,
	plaintext: Buffer,
): { nonce: Buffer; blob: Buffer } => {
	const nonce = randomBytes(NONCE_BYTES);
	const cipher = createCipheriv(ALGO, key, nonce);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return { nonce, blob: Buffer.concat([ciphertext, tag]) };
};

export const aesDecrypt = (key: Buffer, nonce: Buffer, blob: Buffer): Buffer => {
	const tag = blob.subarray(blob.length - TAG_BYTES);
	const ciphertext = blob.subarray(0, blob.length - TAG_BYTES);
	const decipher = createDecipheriv(ALGO, key, nonce);
	decipher.setAuthTag(tag);
	// .final() throws if the tag doesn't verify — tamper/wrong-key detection.
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};
