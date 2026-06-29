import { db, user } from "@psg/db";
import { eq } from "drizzle-orm";

export type User = typeof user.$inferSelect;

/** Find the user for a SteamID (the QR login identity), creating one if needed. */
export const findOrCreateUser = async (steamId: string): Promise<User> => {
	const existing = (
		await db.select().from(user).where(eq(user.steamId, steamId))
	)[0];
	if (existing) return existing;
	const rows = await db.insert(user).values({ steamId }).returning();
	return rows[0] as User;
};

export const getUser = async (id: number): Promise<User | null> =>
	(await db.select().from(user).where(eq(user.id, id)))[0] ?? null;
