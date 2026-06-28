// Zero-knowledge envelope encryption for Steam refresh tokens (WEBAPP_PLAN §3).
//
//   password ──Argon2id(salt_auth)──▶ auth hash   (stored; login)
//   password ──Argon2id(salt_kek)───▶ KEK         (memory only; never stored)
//   random DEK ──AES-256-GCM──▶ encrypted token
//   KEK ──AES-256-GCM──▶ wrapped DEK
//
// Signatures are the contract for Phase 3; bodies are implemented there.

export interface EnvelopeRecord {
	readonly saltAuth: string;
	readonly saltKek: string;
	readonly authHash: string;
	readonly wrappedDek: string;
	readonly dekNonce: string;
	readonly encryptedToken: string;
	readonly tokenNonce: string;
}

// Argon2id parameters — strong by default to resist offline brute force.
export const ARGON2_PARAMS = {
	memoryCost: 1 << 16, // 64 MiB
	timeCost: 3,
	parallelism: 1,
} as const;

const todo = (what: string): never => {
	throw new Error(`@psg/crypto: ${what} not implemented (Phase 3)`);
};

/** Derive the login auth hash from the password (stored). */
export const deriveAuthHash = async (
	_password: string,
	_saltAuth: Uint8Array,
): Promise<string> => todo("deriveAuthHash");

/** Derive the KEK from the password (kept in memory only, never persisted). */
export const deriveKek = async (
	_password: string,
	_saltKek: Uint8Array,
): Promise<Buffer> => todo("deriveKek");

/** Encrypt a fresh Steam refresh token, producing a full envelope record. */
export const sealToken = async (
	_password: string,
	_refreshToken: string,
): Promise<EnvelopeRecord> => todo("sealToken");

/** Re-derive the KEK, unwrap the DEK, and decrypt the refresh token. */
export const openToken = async (
	_password: string,
	_record: EnvelopeRecord,
): Promise<string> => todo("openToken");
