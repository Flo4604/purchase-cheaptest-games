import { openToken, sealToken } from "@psg/crypto";
import { account, db } from "@psg/db";
import { eq } from "drizzle-orm";

export type Account = typeof account.$inferSelect;

export interface AccountConfigInput {
	limit?: string;
	usage?: string;
	maxPrice?: number;
	priceOptionsFlag?: number;
	mode?: string;
}

/** Add a Steam account for a user: envelope-encrypt the refresh token under the
 * user's KEK and store only ciphertext. */
export const addSteamAccount = async (
	userId: number,
	kek: Buffer,
	username: string,
	refreshToken: string,
	config: AccountConfigInput = {},
): Promise<Account> => {
	const sealed = sealToken(kek, refreshToken);
	const rows = await db
		.insert(account)
		.values({
			userId,
			username,
			wrappedDek: sealed.wrappedDek,
			dekNonce: sealed.dekNonce,
			encryptedRefreshToken: sealed.encryptedToken,
			tokenNonce: sealed.tokenNonce,
			...config,
		})
		.returning();
	return rows[0] as Account;
};

type SealedColumns = Pick<
	Account,
	"wrappedDek" | "dekNonce" | "encryptedRefreshToken" | "tokenNonce"
>;

/** Decrypt an account's Steam refresh token with the in-memory KEK. */
export const getAccountRefreshToken = (acct: SealedColumns, kek: Buffer): string => {
	if (
		!acct.wrappedDek ||
		!acct.dekNonce ||
		!acct.encryptedRefreshToken ||
		!acct.tokenNonce
	) {
		throw new Error("account has no sealed refresh token");
	}
	return openToken(kek, {
		wrappedDek: acct.wrappedDek,
		dekNonce: acct.dekNonce,
		encryptedToken: acct.encryptedRefreshToken,
		tokenNonce: acct.tokenNonce,
	});
};

/** Re-seal a rotated refresh token (steam-session refresh) under the same KEK. */
export const updateAccountToken = async (
	accountId: number,
	kek: Buffer,
	refreshToken: string,
): Promise<void> => {
	const sealed = sealToken(kek, refreshToken);
	await db
		.update(account)
		.set({
			wrappedDek: sealed.wrappedDek,
			dekNonce: sealed.dekNonce,
			encryptedRefreshToken: sealed.encryptedToken,
			tokenNonce: sealed.tokenNonce,
		})
		.where(eq(account.id, accountId));
};
