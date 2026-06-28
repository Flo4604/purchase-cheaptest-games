import moment from "moment";
import { EXTRA_OPTIONS } from "../lib/constants.js";
import { getPriceWithoutFees, toCents } from "../lib/util.js";
import { fixMarketHashName } from "../ops/apps.js";
import { getInventory, getItemPrice } from "../ops/market.js";
import type { SteamSession } from "../session.js";
import type { GemConfig, Wallet } from "../types.js";

const pricePerGem = 0.46 / 1000;

export const turnIntoGems = async (
	session: SteamSession,
	config: GemConfig,
	wallet: Wallet,
): Promise<void> =>
	// biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
	new Promise<void>(async (resolve) => {
		const inventoryContent = (await getInventory(session)) as any[];
		const { sellOptionsFlag } = config;

		const itemToGems: any[] = [];

		// Filter based on selected flags - only items that can be turned into gems
		const canTurnToGems = (item: any) =>
			item.owner_actions?.find(
				(action: any) => action.name === "Turn into Gems...",
			);

		// eslint-disable-next-line no-bitwise
		if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.BACKGROUNDS) {
			const backgrounds = inventoryContent.filter(
				(item) =>
					item.type.includes("Background") &&
					!item.type.includes("Profile") &&
					canTurnToGems(item),
			);
			itemToGems.push(...backgrounds);
		}

		// eslint-disable-next-line no-bitwise
		if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.EMOTICONS) {
			const emoticons = inventoryContent.filter(
				(item) => item.type.includes("Emoticon") && canTurnToGems(item),
			);
			itemToGems.push(...emoticons);
		}

		// eslint-disable-next-line no-bitwise
		if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.PROFILE_BACKGROUNDS) {
			const profileBgs = inventoryContent.filter(
				(item) =>
					item.type.includes("Profile Background") && canTurnToGems(item),
			);
			itemToGems.push(...profileBgs);
		}

		// eslint-disable-next-line no-bitwise
		if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.MINI_PROFILE_BACKGROUNDS) {
			const miniBgs = inventoryContent.filter(
				(item) =>
					item.type.includes("Mini Profile Background") && canTurnToGems(item),
			);
			itemToGems.push(...miniBgs);
		}

		// Note: Trading cards, stickers, chat effects, avatars, and frames typically cannot be turned into gems
		// so we don't include them here even if selected

		// const bar = new cliProgress.SingleBar(
		//     {
		//         stopOnComplete: true,
		//         format: "Turning Into Gems | {bar} | {percentage}% | {value}/{total} Items | Time Elapsed: {duration}s | {eta}s | Total Gems: {gems}",
		//     },
		//     cliProgress.Presets.shades_grey,
		// );

		// bar.start(itemToGems.length, 0, { duration: 0, gems: 0 });

		const startTime = moment().valueOf();
		let totalGems = 0;
		const gemCache: Record<string, any> = {};
		const priceCache: Record<string, number> = {};

		session.progress.info(
			`Starting gem conversion process... for ${itemToGems.length} items`,
		);

		let index = 0;
		const total = itemToGems.length;

		for (const item of itemToGems) {
			index++;
			const itemType = item.owner_actions
				.find((action: any) => action.name === "Turn into Gems...")
				.link.match("GetGooValue(.*?, .*?, .*?, (.*?),.*)")[2];

			let expectedGems = 0;
			if (typeof gemCache[item.market_hash_name] === "undefined") {
				const gemWorthResponse = session.responseToJSON(
					(await session.getRequest(
						`https://steamcommunity.com/auction/ajaxgetgoovalueforitemtype/?appid=${item.market_fee_app}&item_type=${itemType}&border_color=0`,
					)) as string,
				) as any;

				if (gemWorthResponse.success !== 1) {
					session.progress.error(
						`Failed to get gem worth for ${item.market_hash_name}`,
					);
					// eslint-disable-next-line no-continue
					continue;
				}

				gemCache[item.market_hash_name] = gemWorthResponse.goo_value;
			}

			expectedGems = gemCache[item.market_hash_name];

			const isNotMarketable =
				!item.marketable &&
				item.descriptions.find(
					(desc: any) =>
						desc.value ===
						"This item can no longer be bought or sold on the Community Market.",
				);

			if (!isNotMarketable) {
				let price = 0;
				if (typeof priceCache[item.market_hash_name] === "undefined") {
					price = await getItemPrice(
						session,
						753,
						fixMarketHashName(item.market_hash_name),
						wallet.currency,
					);

					if (price === -1) {
						session.progress.error(
							`Failed to get price for ${item.market_hash_name}`,
						);
						// eslint-disable-next-line no-continue
						continue;
					}
					priceCache[item.market_hash_name] = price;
				} else {
					price = priceCache[item.market_hash_name];
				}

				let priceWithoutFees = getPriceWithoutFees(price);

				// Steam Min price
				if (priceWithoutFees <= 0.03) {
					priceWithoutFees = 0.01;
				}

				priceWithoutFees = Number.parseInt(toCents(priceWithoutFees));
				const gemPriceToGet = Number.parseInt(
					toCents(expectedGems * pricePerGem),
				);

				if (priceWithoutFees > gemPriceToGet) {
					session.progress.info(
						`[Skipped][${index}/${total}] Item ${item.market_hash_name} is better off sold for ${priceWithoutFees} than grinding for (${gemPriceToGet})`,
					);

					continue;
				}

				if (priceWithoutFees > 100) {
					session.progress.info(
						`[Skipped][${index}/${total}] Item ${item.market_hash_name} is too expensive to grind for (${gemPriceToGet})`,
					);

					continue;
				}

				session.progress.info(
					`[Grinding][${index}/${total}] Item ${item.market_hash_name} is worth grinding for ${gemPriceToGet} vs ${priceWithoutFees}`,
				);
			} else {
				session.progress.info(
					`[Grinding][${index}/${total}] Item ${item.market_hash_name} is NMC so grinding`,
				);
			}

			const data = `sessionid=${session.sessionId}&appid=${item.market_fee_app}&assetid=${item.assetid}&contextid=6&goo_value_expected=${expectedGems}`;

			const grindResponse = session.responseToJSON(
				(await session.postRequest(
					`https://steamcommunity.com/profiles/${session.community.steamID}/ajaxgrindintogoo/`,
					data,
					{
						"Content-Type":
							"application/x-www-form-urlencoded; charset=UTF-8",
						Referer: `https://steamcommunity.com/profiles/${session.community.steamID}/inventory`,
						Origin: "https://steamcommunity.com",
						Cookie: session.cookies.join("; "),
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
					},
				)) as string,
			) as any;

			if (grindResponse.success === 1) {
				totalGems += Number(expectedGems);
				//   logger.log(`[${moment().format()}] Successfully turned ${item.market_name} into ${expectedGems} gems.`);
			} else {
				session.progress.error(
					`[${moment().format()}] Failed to turn ${
						item.market_name
					} into gems.`,
				);
			}

			// bar.update(i + 1, {
			//     duration: `${moment
			//         .duration(moment().valueOf() - startTime)
			//         .humanize()}`,
			//     gems: totalGems,
			// });
		}

		void startTime;
		resolve();
	});
