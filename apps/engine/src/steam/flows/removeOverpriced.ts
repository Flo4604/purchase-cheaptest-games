import moment from "moment";
import { getPriceWithoutFees } from "../lib/util.js";
import {
	getItemPrice,
	getMarketListings,
	removeMarketListing,
} from "../ops/market.js";
import type { SteamSession } from "../session.js";
import type { CleanupConfig, Wallet } from "../types.js";

export const removeOverpricedItems = async (
	session: SteamSession,
	wallet: Wallet,
	config: CleanupConfig,
): Promise<void> => {
	const listedItems = await getMarketListings(session);
	const removeAll = config.removeAll || false;

	const bar = session.progress.startBar(
		"Removing Items",
		listedItems.length,
		0,
	);
	bar.update(0, {
		removedCount: 0,
		duration: 0,
		listedPrice: 0,
		removedPrice: 0,
	});

	const cache: Record<string, number> = {};
	let removedCount = 0;
	let listedPrice = 0;
	let removedPrice = 0;
	const startTime = moment().valueOf();

	for (let i = 0; i < listedItems.length; i += 1) {
		let price = 0;

		bar.update(i + 1, {
			removedCount,
			duration: `${moment.duration(moment().valueOf() - startTime).humanize()}`,
			removedPrice: removedPrice.toFixed(2),
			listedPrice: listedPrice.toFixed(2),
		});

		if (typeof cache[listedItems[i].hashName] === "undefined") {
			// hashName format is "{appid}|||{item_name}"
			const [appId, itemName] = listedItems[i].hashName.split("|||");

			price = await getItemPrice(session, appId, itemName, wallet.currency);

			if (price === -1) {
				// eslint-disable-next-line no-continue
				continue;
			}
			cache[listedItems[i].hashName] = price;
		} else {
			price = cache[listedItems[i].hashName];
		}

		if (listedItems[i].listingPrice > price || removeAll || price > 5) {
			removedCount += 1;
			await removeMarketListing(session, listedItems[i].listingId);
			removedPrice += getPriceWithoutFees(listedItems[i].listingPrice);
		} else {
			listedPrice += getPriceWithoutFees(listedItems[i].listingPrice);
		}
	}

	bar.stop();
};
