// Argon2id parameters — strong by default to resist offline brute force of weak
// passwords (the only residual risk in the zero-knowledge model, WEBAPP_PLAN §3).
export const ARGON2_PARAMS = {
	memoryCost: 1 << 16, // 64 MiB
	timeCost: 3,
	parallelism: 1,
} as const;

/** Per-user password material. Stored on the User row; the KEK derived from
 * (password + saltKek) is NEVER stored. */
export interface PasswordRecord {
	readonly saltAuth: string;
	readonly saltKek: string;
	readonly authHash: string;
}

/** Per-account sealed Steam refresh token (envelope-encrypted). Stored on the
 * Account row. Opened only with the in-memory KEK. */
export interface SealedToken {
	readonly wrappedDek: string;
	readonly dekNonce: string;
	readonly encryptedToken: string;
	readonly tokenNonce: string;
}
