import type { SteamSession } from "../session.js";
import type { Wallet } from "../types.js";

export const getWalletBalance = async (session: SteamSession): Promise<Wallet> =>
	new Promise<Wallet>((resolve) => {
		session.store.getWalletBalance(
			(err: unknown, response: { formattedBalance: string }) => {
				if (err) {
					session.progress.error(`Error getting wallet balance: ${err}`);
				}

				const { amount, currency } = session.balanceToAmount(
					response.formattedBalance,
				) as { amount: number; currency: string };

				// check if the user has a wallet
				const hasWallet = !!currency && !!amount;

				resolve({
					hasWallet,
					currency,
					balance: amount,
				});
			},
		);
	});
