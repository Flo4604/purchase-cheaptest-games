import { app, db } from "@psg/db";
import { eq } from "drizzle-orm";
import { roundPrice } from "../lib/util.js";
import { addGamesToCart, checkoutCart, forgetCart } from "../ops/cart.js";
import { loadCheapestGames } from "../ops/catalog.js";
import type { SteamSession } from "../session.js";
import type { BuyConfig, GameApp, Wallet } from "../types.js";

export const buyGames = async (
	session: SteamSession,
	config: BuyConfig,
	ownedApps: any[],
	ownedAppsRealCount: number,
	wallet: Wallet,
): Promise<void> => {
	// getLimitedGames()
	const limited = await db.select().from(app).where(eq(app.limited, true));

	const games = await loadCheapestGames(
		session,
		config,
		0,
		100,
		ownedApps,
		ownedAppsRealCount,
		wallet,
		limited,
	);

	// showGamesToBuy(games, config, wallet) lived in the CLI's config.js and
	// prompted interactively. The engine is headless, so we inline the
	// "confirm purchase" path: report the totals and take the first `limit` games.
	// TODO(phase4): interactive game selection
	const totalPrice = roundPrice(
		games.reduce((acc: number, game: GameApp) => acc + game.price, 0),
	);
	const averagePrice = roundPrice(totalPrice / games.length);

	session.progress.info(
		`We have ${games.length} apps to buy in total for a total price of ${totalPrice} ${wallet.currency} | average price of ${averagePrice} ${wallet.currency}`,
	);

	// only add as many games as that fit into the limit
	const appList = games.slice(0, config.limit as number);

	if (config.usage !== "preview") {
		await forgetCart(session);

		await addGamesToCart(session, appList as { subId: number }[]);

		await checkoutCart(session);

		await forgetCart(session);
	}
};
