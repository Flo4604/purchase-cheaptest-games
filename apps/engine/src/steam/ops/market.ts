import * as cheerio from "cheerio";
import { CURRENCY_CODES } from "../lib/constants.js";
import type { SSRListing } from "../lib/ssrParser.js";
import { parseSSRListing } from "../lib/ssrParser.js";
import type { SteamSession } from "../session.js";

export const sellItem = async (
	session: SteamSession,
	appId: number | string,
	contextId: number | string,
	assetId: number | string,
	price: number | string,
	amount: number | string,
): Promise<true | false | { error: string; message: string }> => {
	const response = session.responseToJSON(
		(await session.postRequest(
			"https://steamcommunity.com/market/sellitem/",
			{
				sessionid: session.sessionId,
				appid: appId,
				contextid: contextId,
				assetid: assetId,
				amount,
				price,
			},
			{
				Cookie: session.cookies.join("; "),
				Referer: `https://steamcommunity.com/profiles/${session.community.steamID.getSteamID64()}/inventory/`,
			},
		)) as string,
	) as {
		success?: boolean;
		message?: string;
	};

	if (response?.success !== true) {
		// Check if error is due to too many pending confirmations
		if (response?.message?.includes("too many listings pending confirmation")) {
			return { error: "PENDING_CONFIRMATIONS", message: response.message };
		}

		session.progress.error(`Could not sell item ${response.message}`);
		return false;
	}

	return true;
};

export const getItemPriceBackup = async (
	session: SteamSession,
	appId: number | string,
	marketHashName: string,
): Promise<number> => {
	const url = new URL("https://steamcommunity.com/market/multibuy");
	url.searchParams.append("appid", String(appId));
	url.searchParams.append("contextid", "2");
	url.searchParams.append("items[]", marketHashName);

	const response = (await session.getRequest(url.href, {
		Referer: "https://steamcommunity.com/market/",
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36",
	})) as string;

	if (!response) return -1;

	const $ = cheerio.load(response);

	return (
		session.balanceToAmount(
			$(".market_dialog_input.market_multi_price").val() as string,
		) as { currency: string; amount: number }
	).amount;
};

export const getItemPrice = async (
	session: SteamSession,
	appId: number | string,
	marketHashName: string,
	currency: string,
): Promise<number> => {
	const url = new URL("https://steamcommunity.com/market/priceoverview/");
	url.searchParams.append("currency", String(CURRENCY_CODES[currency]));
	url.searchParams.append("appid", String(appId));
	url.searchParams.append("market_hash_name", marketHashName);

	const response = session.responseToJSON(
		(await session
			.getRequest(url.href, {
				Referer: "https://steamcommunity.com/market/",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
			})
			.catch((e) => {
				console.error(e);
				return {};
			})) as string,
	) as {
		success?: unknown;
		lowest_price?: string;
	};

	if (
		typeof response?.success !== "undefined" &&
		typeof response?.lowest_price !== "undefined"
	) {
		return (
			session.balanceToAmount(response?.lowest_price) as {
				currency: string;
				amount: number;
			}
		).amount;
	}

	return getItemPriceBackup(session, appId, marketHashName);
};

// Steam's new (React SSR) market UI no longer exposes `item_nameid` in the
// listing page HTML, so the old getItemNameId + /market/itemordershistogram
// flow is dead. The orderbook (highest buy / lowest sell) is now embedded in
// the page's inline SSR react-query cache, so a single listing-page fetch gives
// us everything. See ssrParser.js.
//
// Returns prices in currency units (e.g. 1.40), matching the old
// getItemOrdersHistogram return value, or null when unavailable.
export const getListingOrderbook = async (
	session: SteamSession,
	appId: number | string,
	marketHashName: string,
): Promise<{
	highestBuyOrder: number | null;
	lowestSellOrder: number | null;
	buyOrderCount: number;
	sellOrderCount: number;
} | null> => {
	const url = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;

	const response = (await session.getRequest(url, {
		Referer: "https://steamcommunity.com/market/",
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
	})) as string;

	if (!response) return null;

	let parsed: SSRListing;
	try {
		parsed = parseSSRListing(response);
	} catch (e) {
		session.progress.warn(
			`getListingOrderbook() failed to parse SSR for ${appId}/${marketHashName}: ${(e as Error).message}`,
		);
		return null;
	}

	const ob = parsed.orderbook as NonNullable<SSRListing["orderbook"]>;
	// amtMaxBuyOrder / amtMinSellOrder are integer cents in the SSR cache.
	return {
		highestBuyOrder:
			ob.amtMaxBuyOrder != null ? Number(ob.amtMaxBuyOrder) / 100 : null,
		lowestSellOrder:
			ob.amtMinSellOrder != null ? Number(ob.amtMinSellOrder) / 100 : null,
		buyOrderCount: ob.cBuyOrders ?? 0,
		sellOrderCount: ob.cSellOrders ?? 0,
	};
};

export const getInventory = (session: SteamSession): Promise<unknown> =>
	new Promise((resolve, reject) => {
		session.community.getUserInventoryContents(
			session.community.steamID,
			753,
			6,
			true,
			(err: unknown, inventory: unknown, _totalCount: unknown) => {
				if (err) {
					reject(err);
				}

				resolve(inventory);
			},
		);
	});

export const getMarketListings = async (
	session: SteamSession,
	_settings?: unknown,
): Promise<
	{
		listingId: string;
		listingName: string;
		listingPrice: number;
		hashName: string;
	}[]
> => {
	let loop = true;

	let start = 0;
	const maxCount = 100;

	const items: {
		listingId: string;
		listingName: string;
		listingPrice: number;
		hashName: string;
	}[] = [];

	let bar: ReturnType<SteamSession["progress"]["startBar"]> | undefined;

	let firstResponse = false;
	let totalListings = 0;

	while (loop) {
		const response = session.responseToJSON(
			(await session.getRequest(
				`https://steamcommunity.com/market/mylistings/render/?query=&start=${start}&count=${maxCount}`,
			)) as string,
		) as {
			success?: boolean;
			total_count: number;
			results_html: string;
			start: number;
			pagesize: number;
		};

		if (response.success) {
			if (!firstResponse) {
				bar = session.progress.startBar(
					"Loading Market Listings",
					response.total_count,
					0,
				);
				firstResponse = true;
				totalListings = response.total_count;
			}

			const $ = cheerio.load(response.results_html);

			const listings = $(".market_listing_row.market_recent_listing_row");

			listings.each((_, listing) => {
				try {
					const listingId = $(listing)
						.attr("id")!
						.replace("mylisting_", "");
					const listingName = $(listing)
						.find(".market_listing_game_name")
						.text();
					const listingPrice = (
						session.balanceToAmount(
							$(listing).find(".market_listing_price").text(),
						) as { currency: string; amount: number }
					).amount;
					const itemLink = $(listing)
						.find(".market_listing_item_name_link")
						.attr("href")!;

					// URL format: https://steamcommunity.com/market/listings/{appid}/{item_name}
					// Split: ["https:", "", "steamcommunity.com", "market", "listings", "{appid}", "{item_name}"]
					const urlParts = itemLink.split("/");
					const appId = urlParts[5];
					const encodedItemName = urlParts[6];
					const itemName = decodeURIComponent(encodedItemName as string);
					const hashName = `${appId}|||${itemName}`;

					if (typeof hashName === "undefined") {
						session.progress.error(
							"getMarketListing() Error getting market listings",
							response,
						);
					} else {
						items.push({
							listingId,
							listingName,
							listingPrice,
							hashName,
						});
					}

					bar?.update(items.length);
				} catch (e) {
					session.progress.error(e as string);
				}

				// get the id before the - for example: https://steamcommunity.com/market/listings/753/1109360-Taeko%20Witch%20%28Foil%29
				// the id is 1109360 and remove the name
			});

			if (response.start + response.pagesize >= totalListings) {
				loop = false;
			} else {
				start += maxCount;
			}
		} else {
			session.progress.error(
				"getMarketListing() Error getting market listings",
				response,
			);
			loop = false;
		}
	}

	bar?.stop();

	return items;
};

export const removeMarketListing = async (
	session: SteamSession,
	listingId: string | number,
): Promise<boolean> => {
	const response = session.responseToJSON(
		(await session.postRequest(
			`https://steamcommunity.com/market/removelisting/${listingId}`,
			{
				sessionid: session.sessionId,
			},
			{
				Referer: "https://steamcommunity.com/market/",
				Origin: "https://steamcommunity.com",
				Cookie: session.cookies.join("; "),
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
			},
		)) as string,
	);

	if (!response) {
		session.progress.error(
			`removeMarketListing() Error removing listing https://steamcommunity.com/market/removelisting/${listingId} :: ${session.sessionId}`,
		);
		return false;
	}

	return true;
};
