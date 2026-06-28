import { createPasswordRecord, deriveKek, verifyPassword } from "@psg/crypto";
import { db, user } from "@psg/db";
import { eq } from "drizzle-orm";

export type User = typeof user.$inferSelect;

export interface AuthResult {
	readonly user: User;
	/** The KEK, derived from the password at login. Hold in memory only. */
	readonly kek: Buffer;
}

/** Register a new user. Stores only password-derived material (never the KEK). */
export const registerUser = async (
	email: string,
	password: string,
): Promise<User> => {
	const rec = await createPasswordRecord(password);
	const rows = await db
		.insert(user)
		.values({
			email,
			authHash: rec.authHash,
			saltAuth: rec.saltAuth,
			saltKek: rec.saltKek,
		})
		.returning();
	return rows[0] as User;
};

/** Verify a login. On success returns the user + the freshly derived KEK; the
 * caller stashes the KEK in the in-memory KeyStore for the session lifetime. */
export const authenticate = async (
	email: string,
	password: string,
): Promise<AuthResult | null> => {
	const rows = await db.select().from(user).where(eq(user.email, email));
	const u = rows[0];
	if (!u) return null;

	const ok = await verifyPassword(password, {
		saltAuth: u.saltAuth,
		authHash: u.authHash,
	});
	if (!ok) return null;

	const kek = await deriveKek(password, u.saltKek);
	return { user: u, kek };
};
