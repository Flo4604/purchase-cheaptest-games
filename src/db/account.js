import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { account } from "./schema.js";

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
