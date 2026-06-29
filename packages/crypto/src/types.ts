/** A Steam refresh token sealed with envelope encryption: a random DEK encrypts
 * the token, and the server master key wraps the DEK. Stored on the Account row;
 * opened only with the in-memory master key. */
export interface SealedToken {
	readonly wrappedDek: string;
	readonly dekNonce: string;
	readonly encryptedToken: string;
	readonly tokenNonce: string;
}
