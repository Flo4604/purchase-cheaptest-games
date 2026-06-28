// LEGACY shim for the reference CLI only. New code (engine) uses `db` directly
// from @psg/db — do not grow this layer.
import { account, db } from "@psg/db";
import { eq } from "drizzle-orm";

const getAccounts = async () => db.select().from(account);

const getAccount = async (id) => {
	const rows = await db.select().from(account).where(eq(account.id, id));
	return rows[0] ?? null;
};

const storeAccount = async (username, accessToken, refreshToken) => {
	const rows = await db
		.insert(account)
		.values({ username, accessToken, refreshToken })
		.returning();
	return rows[0];
};

const updateTokens = async (id, accessToken, refreshToken) =>
	db
		.update(account)
		.set({ accessToken, refreshToken })
		.where(eq(account.id, id));

const updateConfig = async (id, limit, usage, maxPrice, priceOptionsFlag) =>
	db
		.update(account)
		.set({
			limit: `${limit}`,
			usage,
			maxPrice: Number(maxPrice),
			priceOptionsFlag,
		})
		.where(eq(account.id, id));

export { getAccounts, getAccount, storeAccount, updateTokens, updateConfig };
