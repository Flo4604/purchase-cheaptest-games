import { app as appTable, bundleApp, db } from "@psg/db";
import * as cheerio from "cheerio";
import { inArray } from "drizzle-orm";
import moment from "moment";
import { writeFileSync } from "node:fs";
import qs from "qs";
import { EXTRA_OPTIONS, MAX_PRICES } from "../lib/constants.js";
import { asyncFilter, roundPrice } from "../lib/util.js";
import type { SteamSession } from "../session.js";
import type { BuyConfig, GameApp, Wallet } from "../types.js";
import { getAppDetails } from "./apps.js";

export const loadCheapestGames = async (
	session: SteamSession,
	config: BuyConfig,
	start: number,
	count: number,
	ownedApps: any[],
	realOwnedAppCount: number,
	wallet: Wallet,
	limitedGames: any[],
): Promise<GameApp[]> => {
	const { maxPrice, usage, limit, priceOptionsFlag } = config;

	const appsToBuy: any[] = [];
	let loop = true;

	const bar = session.progress.startBar(
		"Loading Games",
		config.limit == "0" ? wallet.balance : (config.limit as number),
		0,
	);

	const startTime = moment().valueOf();

	while (loop) {
		const data: Record<string, unknown> = {
			start,
			count,
			dynamic_data: "",
			sort_by: "Price_ASC",
			maxprice: MAX_PRICES[wallet.currency],
			category1: "998",
			hidef2p: "1",
			ndl: "1",
			snr: "1_7_7_230_7",
			infinite: "1",
			sessionid: session.sessionId,
		};

		// bitwise operator to check if the priceOptionsFlag is set
		// eslint-disable-next-line no-bitwise
		if (
			priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS ||
			// eslint-disable-next-line no-bitwise
			priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS_LIMITED
		) {
			data.category2 = "29";
		}

		// create query string from object
		const url = `https://store.steampowered.com/search/results/?query&${qs.stringify(
			data,
		)}`;

		// eslint-disable-next-line no-await-in-loop
		const response = JSON.parse((await session.getRequest(url)) as string);

		const $ = cheerio.load(response.results_html);

		start += count;

		let foundApps: any[] = await Promise.all(
			$("a")
				.map(async (_, el) => {
					const element = $(el);

					// find data-price-final in child element
					const price =
						Number(
							element
								.find("[data-price-final]")
								.attr("data-price-final")!
								.replace(",", ""),
						) / 100;
					const name = element.find(".title").text();
					const appUrl = element.attr("href")!;
					const appId = element.attr("data-ds-appid")!;

					// convert the element to html and write it to a file
					if (!appId) {
						writeFileSync(
							`./debug/noappid_${new Date().getTime()}.html`,
							element.html()!,
						);
						return [];
					}

					if (
						appUrl.startsWith("https://store.steampowered.com/sub/")
					) {
						// the appId will be the subId
						const subId = appUrl.split("/")[4];

						appId.split(",").forEach(async (id) => {
							await getAppDetails(session, { name, appId: id, price });
						});

						await getAppDetails(
							session,
							{
								name,
								appId: subId,
								price,
								// The original used `.forEach(...)` here, which has no side
								// effects and evaluates to `undefined`; preserved verbatim.
								includedApps: undefined,
							},
							appUrl,
						);

						return {
							name,
							price,
							url: appUrl,
							appId: subId,
							isSub: true,
							appsInPackage: appId.split(","),
						};
					}

					if (
						!ownedApps.includes(appId) &&
						!limitedGames.includes(appId)
					) {
						await getAppDetails(session, { name, appId, price });
					}

					return {
						name,
						price,
						url: appUrl,
						appId,
						isSub: false,
					};
				})
				.get(),
		);

		// check for array for any 2d arrays and if so flatten it
		foundApps = foundApps.flat();

		// filter out empty arrays
		foundApps = foundApps.filter((app) => app);

		const resultCount = foundApps.length;

		// check if more than 50% of the games are over the limit
		if (
			maxPrice !== 0 &&
			(foundApps.filter((app) => app.price > maxPrice).length /
				foundApps.length) *
				100 >
				50
		) {
			session.progress.warn(
				`Found ${resultCount} games, but more than 50% of them are over the limit of ${maxPrice} ${wallet.currency}`,
			);
			loop = false;
			return appsToBuy;
		}

		// Batch-load DB rows for every found app up front (two queries total)
		// instead of querying getApp()/bundleApp per app inside the filter (N+1).
		const foundIds = foundApps.map((fa) => Number(fa.appId));
		const appRows = foundIds.length
			? await db.select().from(appTable).where(inArray(appTable.id, foundIds))
			: [];
		const appById = new Map<number, any>(appRows.map((r) => [r.id, r]));
		const bundleIds = appRows.map((r) => r.id);
		const bundleRows = bundleIds.length
			? await db
					.select()
					.from(bundleApp)
					.where(inArray(bundleApp.bundleId, bundleIds))
			: [];
		const includedByBundle = new Map<number, any[]>();
		for (const row of bundleRows) {
			const list = includedByBundle.get(row.bundleId) ?? [];
			list.push(row);
			includedByBundle.set(row.bundleId, list);
		}

		foundApps = await asyncFilter(foundApps, async (foundApp) => {
			const index = foundApps.indexOf(foundApp);

			// getApp(foundApp.appId) from the pre-fetched maps (no per-app query)
			const _found = appById.get(Number(foundApp.appId));
			const app: any = _found
				? { ..._found, includedApps: includedByBundle.get(_found.id) ?? [] }
				: null;

			if (!app) {
				session.progress.log(
					`No app found for ${foundApp.appId} (${foundApp.name})`,
				);
				return false;
			}

			// check if the app is owned

			if (ownedApps.includes(app.id) || ownedApps.includes(app.subId)) {
				return false;
			}

			if ([42180, 42140].includes(Number(app.appId))) {
				return false;
			}

			// check if the app is limited and we do not have the TRADING_CARDS_LIMITED option set
			// eslint-disable-next-line no-bitwise
			if (
				app.limited &&
				!(priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS_LIMITED)
			) {
				return false;
			}

			if (parseInt(maxPrice as any) !== 0 && foundApp.price > maxPrice) {
				return false;
			}

			if (appsToBuy.find((appToBuy) => appToBuy.appId === app.id)) {
				return false;
			}

			if (app.includedApps.length > 0) {
				const ignoreDueToIncludedApps = app.includedApps.forEach(
					(element: any) => {
						if (ownedApps.includes(element.id)) {
							return false;
						}

						if (
							appsToBuy.find(
								(appToBuy) => appToBuy.appId === element.id,
							)
						) {
							return false;
						}
						return true;
					},
				);

				if (!ignoreDueToIncludedApps) {
					return false;
				}
			}

			// eslint-disable-next-line no-bitwise
			if (
				(priceOptionsFlag & EXTRA_OPTIONS.BUYING.TRADING_CARDS ||
					// eslint-disable-next-line no-bitwise
					priceOptionsFlag &
						EXTRA_OPTIONS.BUYING.TRADING_CARDS_LIMITED) &&
				!app.hasTradingCards
			) {
				return false;
			}

			foundApps[index] = { ...app, ...foundApp };

			return true;
		});

		for (let i = 0; i < foundApps.length; i += 1) {
			const app = foundApps[i];

			const currentPriceOfAllApps = appsToBuy.reduce(
				(acc, appToBuy) => acc + appToBuy.price,
				0,
			);

			if (
				["max"].includes(usage) &&
				currentPriceOfAllApps + app.price > wallet.balance
			) {
				session.progress.info(
					`The current price of all apps (${roundPrice(
						currentPriceOfAllApps,
					)} ${wallet.currency}) plus the price of the next app (${app.price} ${
						wallet.currency
					}) is higher than the balance (${wallet.balance} ${wallet.currency})`,
				);
				loop = false;
				break;
			}

			if (
				["balance"].includes(usage) &&
				currentPriceOfAllApps + app.price > limit
			) {
				session.progress.info(
					`The current price of all apps (${currentPriceOfAllApps} ${wallet.currency}) plus the price of the next app (${app.price} ${wallet.currency}) is higher than the limit (${limit} ${wallet.currency})`,
				);
				loop = false;
				break;
			}

			if (
				["amount", "next", "preview"].includes(usage) &&
				appsToBuy.length > Number(limit)
			) {
				session.progress.info(
					`The current amount of apps (${appsToBuy.length}) is higher than the limit (${limit})`,
				);
				loop = false;
				if (appsToBuy.length + 1 < Number(limit)) appsToBuy.push(app);
				break;
			}

			if (!loop) break;

			appsToBuy.push(app);
		}

		const totalPrice = roundPrice(
			appsToBuy.reduce((acc, app) => acc + app.price, 0),
		);
		const averagePrice = roundPrice(totalPrice / appsToBuy.length || 0);

		// moment to relativetimestamp

		bar.update(config.limit == "0" ? totalPrice : appsToBuy.length, {
			totalPrice: `${totalPrice} ${wallet.currency}`,
			averagePrice: `${averagePrice} ${wallet.currency}`,
			duration: `${moment.duration(moment().valueOf() - startTime).humanize()}`,
		});

		if (!loop) break;
	}

	bar.stop();

	return appsToBuy;
};
