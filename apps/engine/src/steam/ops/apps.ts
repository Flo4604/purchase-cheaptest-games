import { app, bundleApp, db } from "@psg/db";
import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { toCents } from "../lib/util.js";
import type { SteamSession } from "../session.js";
import type { GameApp } from "../types.js";

export async function getAppDetails(
	session: SteamSession,
	app_: GameApp,
	forceUrl: string | false = false,
): Promise<unknown> {
	const {
		appId,
		isBundle = false,
		includedApps = undefined,
		price,
	} = app_ as {
		appId: number | string;
		isBundle?: boolean;
		includedApps?: unknown[];
		price: number | string;
	};

	// getApp(appId) -> row + includedApps[], or null
	const _rows = await db.select().from(app).where(eq(app.id, Number(appId)));
	const _found = _rows[0];
	const appInDb = _found
		? {
				..._found,
				includedApps: await db
					.select()
					.from(bundleApp)
					.where(eq(bundleApp.bundleId, _found.id)),
			}
		: null;

	if (
		appInDb &&
		Number(app_.price) === appInDb.price &&
		appInDb.id === Number(appId)
	) {
		console.log(
			`app already in db and price is the same so skipping ${appId}`,
		);
		(appInDb as Record<string, unknown>).isInDb = true;
		return appInDb;
	}

	const url =
		forceUrl ||
		`https://store.steampowered.com/app/${appId}?snr=1_direct-navigation__`;

	const appPage = (await session.getRequest(url)) as string;

	if (!appPage) {
		session.progress.error(`getAppDetails(): Failed to fetch page for ${appId}`);
		return false;
	}

	const $ = cheerio.load(appPage);

	if (!session.countryCode) {
		const config = $("#application_config").first();
		const configData = config.attr("data-config");
		session.countryCode = JSON.parse(configData as string).COUNTRY;
	}

	const gameElements = $(".game_area_purchase_game_wrapper").toArray();

	if (gameElements.length === 0) {
		session.progress.error(
			`getAppDetails(): Error getting price elements for ${appId}`,
		);
		return false;
	}

	const requiresOther = $(".game_area_dlc_bubble").toArray();
	if (requiresOther.length > 0) {
		session.progress.error(
			`getAppDetails(): Skipped due to requirements: ${appId}`,
		);
		return false;
	}

	const gameElement = $(
		gameElements.find((el) => {
			const element = $(el);

			// find the data-price-final attribute
			const priceElement = element.find("[data-price-final]");

			return (
				priceElement.length > 0 &&
				priceElement.attr("data-price-final") === toCents(price)
			);
		}) as cheerio.Element,
	);

	if (gameElement.length === 0) {
		session.progress.error(
			`getAppDetails(): Error getting price element for ${appId}, price: ${toCents(
				price,
			)}`,
		);
		writeFileSync(`./debug/${appId}.html`, appPage);
		return false;
	}

	// from this element get the subid and snr inputs
	const subId = gameElement.find("input[name=subid]").val() as string;
	const snr = gameElement.find("input[name=snr]").val() as string;
	const originatingSnr = gameElement
		.find("input[name=originating_snr]")
		.val() as string;

	const limitedRegex =
		/Profile Features Limited|Steam is learning about this game/g;
	const cardRegex = /Steam Trading Cards/g;
	const isLimited = !!limitedRegex.exec(appPage);
	const hasTradingCards = !!cardRegex.exec(appPage);

	if (
		appInDb &&
		(appInDb.limited !== isLimited ||
			appInDb.hasTradingCards !== hasTradingCards)
	) {
		// updateGame(appId, isLimited, hasTradingCards)
		return db
			.update(app)
			.set({
				limited: Boolean(isLimited),
				hasTradingCards: Boolean(hasTradingCards),
			})
			.where(eq(app.id, Number(appId)));
	}

	app_.subId = subId;
	app_.snr = snr;
	app_.originatingSnr = originatingSnr;
	app_.id = Number(appId);
	app_.limited = isLimited;
	app_.hasTradingCards = hasTradingCards;
	app_.isBundle = isBundle;
	app_.includedApps = includedApps;

	if (!app_.subId) {
		session.progress.log(`No subId found for app ${appId}`);
		writeFileSync(`./debug/nosubid_${appId}.html`, appPage);
		return [];
	}

	if (appInDb === null) {
		// addApp(app_)
		const values: typeof app.$inferInsert = {
			id: Number(app_.appId),
			name: app_.name as string,
			subId: Number(app_.subId),
			snr: app_.snr as string,
			originatingSnr: app_.originatingSnr as string,
			price: Number(app_.price),
			limited: Boolean(app_.limited),
			hasTradingCards: Boolean(app_.hasTradingCards),
			isBundle: Boolean(app_.isBundle),
		};
		try {
			await db
				.insert(app)
				.values(values)
				.onConflictDoUpdate({
					target: app.id,
					set: {
						name: values.name,
						subId: values.subId,
						snr: values.snr,
						originatingSnr: values.originatingSnr,
						price: values.price,
						limited: values.limited,
						hasTradingCards: values.hasTradingCards,
						isBundle: values.isBundle,
					},
				});
		} catch (error) {
			session.progress.error((error as Error).message);
		}
	}

	if (appId === "46480") {
		console.log(appId, app_);
	}
	return app_;
}

export const fixMarketHashName = (marketHashName: string): string => {
	const fixedMarketHashName = marketHashName.replace(/\//g, "-");
	return fixedMarketHashName;
};

export const getOwnedApps = async (session: SteamSession): Promise<unknown[]> =>
	new Promise<unknown[]>((resolve, reject) => {
		session.store.getAccountData(
			async (error: unknown, apps: unknown[], packages: unknown[]) => {
				if (error) {
					session.progress.error(error as string);
					reject(error);
				}

				resolve(apps.concat(packages));
			},
		);
	});

export const getOwnedAppsCount = async (
	session: SteamSession,
): Promise<number> => {
	const response = (await session.getRequest(
		"https://steamcommunity.com/my/badges/13",
	)) as string;

	const $ = cheerio.load(response);

	return Number(
		$(".badge_description")
			?.text()
			?.replace(/[^0-9]/g, "") ?? 9,
	);
};
