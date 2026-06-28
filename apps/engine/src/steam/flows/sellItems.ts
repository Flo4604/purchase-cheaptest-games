import moment from "moment";
import { EXTRA_OPTIONS } from "../lib/constants.js";
import { getPriceWithoutFees } from "../lib/util.js";
import { fixMarketHashName } from "../ops/apps.js";
import {
	getInventory,
	getItemPrice,
	getListingOrderbook,
	sellItem,
} from "../ops/market.js";
import type { SteamSession } from "../session.js";
import type { SellConfig, Wallet } from "../types.js";

export const sellItems = async (
	session: SteamSession,
	config: SellConfig,
	wallet: Wallet,
): Promise<void> => {
	const inventoryContent = (await getInventory(session)) as any[];
	const { sellOptionsFlag } = config;

	const items: any[] = [];

	// Filter based on selected flags
	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.ALL_TRADING_CARDS) {
		const allCards = inventoryContent.filter(
			(item) => item.type.includes("Card") && item.marketable,
		);
		items.push(...allCards);
		// eslint-disable-next-line no-bitwise
	} else {
		// eslint-disable-next-line no-bitwise
		if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.NORMAL_TRADING_CARDS) {
			const normalCards = inventoryContent.filter(
				(item) =>
					item.type.includes("Card") &&
					!item.type.includes("Foil") &&
					item.marketable,
			);
			items.push(...normalCards);
		}
		// eslint-disable-next-line no-bitwise
		if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.FOIL_TRADING_CARDS) {
			const foilCards = inventoryContent.filter(
				(item) =>
					item.type.includes("Card") &&
					item.type.includes("Foil") &&
					item.marketable,
			);
			items.push(...foilCards);
		}
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.BACKGROUNDS) {
		const backgrounds = inventoryContent.filter(
			(item) =>
				item.type.includes("Background") &&
				!item.type.includes("Profile") &&
				item.marketable,
		);
		items.push(...backgrounds);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.EMOTICONS) {
		const emoticons = inventoryContent.filter(
			(item) => item.type.includes("Emoticon") && item.marketable,
		);
		items.push(...emoticons);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.PROFILE_BACKGROUNDS) {
		const profileBgs = inventoryContent.filter(
			(item) => item.type.includes("Profile Background") && item.marketable,
		);
		items.push(...profileBgs);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.MINI_PROFILE_BACKGROUNDS) {
		const miniBgs = inventoryContent.filter(
			(item) =>
				item.type.includes("Mini Profile Background") && item.marketable,
		);
		items.push(...miniBgs);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.STICKERS) {
		const stickers = inventoryContent.filter(
			(item) => item.type.includes("Sticker") && item.marketable,
		);
		items.push(...stickers);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.CHAT_EFFECTS) {
		const chatEffects = inventoryContent.filter(
			(item) => item.type.includes("Chat Effect") && item.marketable,
		);
		items.push(...chatEffects);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.ANIMATED_AVATARS) {
		const animatedAvatars = inventoryContent.filter(
			(item) => item.type.includes("Animated Avatar") && item.marketable,
		);
		items.push(...animatedAvatars);
	}

	// eslint-disable-next-line no-bitwise
	if (sellOptionsFlag & EXTRA_OPTIONS.SELLING.AVATAR_FRAMES) {
		const avatarFrames = inventoryContent.filter(
			(item) => item.type.includes("Avatar Frame") && item.marketable,
		);
		items.push(...avatarFrames);
	}

	session.progress.info(
		`Starting to sell ${items.length} items (Instant Sell: ${config.instantSell ? "Yes" : "No"})...`,
	);

	const startTime = moment().valueOf();
	let totalPrice = 0;
	const priceCache: Record<string, number> = {};
	const orderbookCache: Record<string, any> = {};
	let skippedCount = 0;
	let soldCount = 0;

	for (let i = 0; i < items.length; i += 1) {
		const item = items[i];

		let price = 0;

		if (typeof priceCache[item.market_hash_name] === "undefined") {
			price = await getItemPrice(
				session,
				item.appid,
				fixMarketHashName(item.market_hash_name),
				wallet.currency,
			);

			if (price === -1) {
				skippedCount += 1;
				// eslint-disable-next-line no-continue
				continue;
			}

			priceCache[item.market_hash_name] = price;
		} else {
			price = priceCache[item.market_hash_name];
		}

		const { priceToRemove, priceCalculation, instantSell, instantSellThreshold } =
			config;

		let calculatedPrice = 0;

		if (priceCalculation === "percentage") {
			calculatedPrice = price - price * (Number(priceToRemove) / 100);
		} else if (priceCalculation === "fixed") {
			calculatedPrice = price - Number(priceToRemove);
		}

		let sellPrice: number | string = 0;

		// Instant sell mode: sell to highest buy order
		if (instantSell) {
			// Get the orderbook from the listing page's SSR cache (new market UI).
			let orderbook = orderbookCache[item.market_hash_name];
			if (!orderbook) {
				orderbook = await getListingOrderbook(
					session,
					item.appid,
					item.market_hash_name,
				);

				if (!orderbook) {
					session.progress.warn(
						`[${i + 1}/${items.length}] Could not get orderbook for ${item.market_hash_name}, skipping`,
					);
					skippedCount += 1;
					// eslint-disable-next-line no-continue
					continue;
				}

				orderbookCache[item.market_hash_name] = orderbook;
			}

			// Get highest buy order (in currency units, e.g. 1.40)
			const highestBuyOrder = orderbook.highestBuyOrder;

			if (!highestBuyOrder || highestBuyOrder === 0) {
				session.progress.warn(
					`[${i + 1}/${items.length}] No buy orders for ${item.market_hash_name}, using normal price`,
				);
				// Fall back to normal pricing
				sellPrice = String(
					Math.round(
						Number(
							(calculatedPrice - calculatedPrice * 0.13043478261).toFixed(2),
						) * 100,
					),
				).replace(/\./, "");
			} else {
				// The highest buy order is what the buyer will pay (e.g., 1.40€)
				// We need to calculate what WE will receive after Steam's fees
				// getPriceWithoutFees reverses the calculation
				const weWillReceive = getPriceWithoutFees(highestBuyOrder);

				// Check if instant sell price is within threshold
				// Compare what we'll receive vs what we'd normally receive
				const normalReceive =
					calculatedPrice - calculatedPrice * 0.13043478261;
				const percentageDiff =
					((normalReceive - weWillReceive) / normalReceive) * 100;

				if (percentageDiff > instantSellThreshold) {
					session.progress.warn(
						`[${i + 1}/${items.length}] ${item.market_hash_name}: Instant sell would receive ${weWillReceive.toFixed(2)} vs normal ${normalReceive.toFixed(2)} (${percentageDiff.toFixed(1)}% less), exceeds threshold (${instantSellThreshold}%), listing at normal price instead`,
					);
					// Fall back to normal pricing
					sellPrice = String(
						Math.round(
							Number(
								(calculatedPrice - calculatedPrice * 0.13043478261).toFixed(2),
							) * 100,
						),
					).replace(/\./, "");
				} else {
					// sellPrice is what WE receive (in cents)
					// If buyer pays 1.40€, we receive ~1.22€, so we send 122
					sellPrice = Math.round(weWillReceive * 100);
					session.progress.info(
						`[${i + 1}/${items.length}] Instant selling ${item.market_hash_name}: buyer pays ${highestBuyOrder.toFixed(2)}, we receive ${weWillReceive.toFixed(2)} ${wallet.currency} (${percentageDiff.toFixed(1)}% less than normal ${normalReceive.toFixed(2)})`,
					);
				}
			}
		} else {
			// Normal sell mode
			// calculate - 0.13043478261%
			sellPrice = String(
				Math.round(
					Number(
						(calculatedPrice - calculatedPrice * 0.13043478261).toFixed(2),
					) * 100,
				),
			).replace(/\./, "");
		}

		// Steam Min price
		if (Number(sellPrice) <= 3) {
			sellPrice = 1;
		}

		if (sellPrice === 0 || Number(sellPrice) >= config.minPrice) {
			const result = await sellItem(
				session,
				item.appid,
				item.contextid,
				item.assetid,
				sellPrice,
				1,
			);

			// Check if we hit pending confirmations limit
			if ((result as { error?: string })?.error === "PENDING_CONFIRMATIONS") {
				session.progress.error(`Too many listings pending confirmation!`);
				session.progress.warn(
					`Please confirm or cancel pending listings in the Steam Mobile App.`,
				);

				// Headless: assume "ready to continue" (the CLI prompted here).
				// TODO(phase4): make this an explicit job param
				session.progress.info(
					`Assuming ready to continue (headless), resuming item selling...`,
				);

				session.progress.info(`Resuming item selling...`);

				// Retry the same item
				const retryResult = await sellItem(
					session,
					item.appid,
					item.contextid,
					item.assetid,
					sellPrice,
					1,
				);

				if (retryResult === true) {
					totalPrice += Number(sellPrice);
					soldCount += 1;
					session.progress.info(
						`[${i + 1}/${items.length}] Sold ${item.market_hash_name} for ${(Number(sellPrice) / 100).toFixed(2)} ${wallet.currency}`,
					);
				}
			} else if (result === true) {
				totalPrice += Number(sellPrice);
				soldCount += 1;
				session.progress.info(
					`[${i + 1}/${items.length}] Sold ${item.market_hash_name} for ${(Number(sellPrice) / 100).toFixed(2)} ${wallet.currency}`,
				);
			}
		}
	}

	session.progress.info(
		`Selling complete! Sold: ${soldCount}, Skipped: ${skippedCount}, Total: ${(totalPrice / 100).toFixed(2)} ${wallet.currency}, Time: ${moment.duration(moment().valueOf() - startTime).humanize()}`,
	);
};
