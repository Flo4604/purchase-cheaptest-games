import type { Account, JobType } from "./api.js";

export const FLOW_TABS: { label: string; value: JobType }[] = [
	{ label: "Buy", value: "buy" },
	{ label: "Sell", value: "sell" },
	{ label: "Gems", value: "gems" },
	{ label: "Clean up", value: "cleanup" },
	{ label: "Redeem", value: "redeem" },
	{ label: "Activate", value: "activate" },
];

export const STRATEGIES = [
	{ label: "Until wallet empty", value: "max" },
	{ label: "Buy N games", value: "amount" },
	{ label: "Spend a balance", value: "balance" },
	{ label: "Until next badge", value: "next" },
	{ label: "Preview badge cost", value: "preview" },
];

export const REDUCTION = [
	{ label: "Fixed amount", value: "fixed" },
	{ label: "Percentage", value: "percentage" },
];

export const BUYING_FLAGS = [
	{ label: "Trading cards (badge)", bit: 1 },
	{ label: "Trading cards (all)", bit: 2 },
];
export const SELLING_FLAGS = [
	{ label: "All trading cards", bit: 4 },
	{ label: "Normal cards", bit: 8 },
	{ label: "Foil cards", bit: 16 },
	{ label: "Backgrounds", bit: 32 },
	{ label: "Emoticons", bit: 64 },
	{ label: "Profile backgrounds", bit: 128 },
	{ label: "Mini profile bgs", bit: 256 },
	{ label: "Stickers", bit: 512 },
	{ label: "Chat effects", bit: 1024 },
	{ label: "Animated avatars", bit: 2048 },
	{ label: "Avatar frames", bit: 4096 },
];

export interface FlowCfg {
	usage: string;
	limit: number;
	maxPrice: number;
	priceOptionsFlag: number;
	sellOptionsFlag: number;
	priceCalculation: string;
	priceToRemove: number;
	minPrice: number;
	instantSell: boolean;
	instantSellThreshold: number;
	removeAll: boolean;
	list: string;
	keys: string;
}

export const defaultCfg = (type: JobType, account: Account): FlowCfg => ({
	usage: type === "buy" ? account.usage : "max",
	limit: type === "buy" ? Number(account.limit) || 0 : 0,
	maxPrice: type === "buy" ? account.maxPrice : 0,
	priceOptionsFlag: type === "buy" ? account.priceOptionsFlag : 0,
	sellOptionsFlag: 4,
	priceCalculation: "fixed",
	priceToRemove: 0.03,
	minPrice: 0,
	instantSell: false,
	instantSellThreshold: 50,
	removeAll: false,
	list: "",
	keys: "",
});

const csv = (s: string) =>
	s
		.split(/[\n,]/)
		.map((t) => t.trim())
		.filter(Boolean);

export const buildConfig = (
	type: JobType,
	cfg: FlowCfg,
	account: Account,
): Record<string, unknown> => {
	switch (type) {
		case "buy":
			return { usage: cfg.usage, limit: cfg.limit, maxPrice: cfg.maxPrice, priceOptionsFlag: cfg.priceOptionsFlag };
		case "sell":
			return {
				sellOptionsFlag: cfg.sellOptionsFlag,
				priceCalculation: cfg.priceCalculation,
				priceToRemove: cfg.priceToRemove,
				minPrice: cfg.minPrice,
				instantSell: cfg.instantSell,
				instantSellThreshold: cfg.instantSellThreshold,
			};
		case "gems":
			return { sellOptionsFlag: cfg.sellOptionsFlag, priceCalculation: cfg.priceCalculation, priceToRemove: cfg.priceToRemove };
		case "cleanup":
			return { removeAll: cfg.removeAll };
		case "redeem":
			return { list: csv(cfg.list) };
		case "activate":
			return { keys: csv(cfg.keys), accountId: account.id };
	}
};

const cur = (account: Account) => account.cachedWalletCurrency ?? "";

// Plain-English description of what will run — builds confidence before launch.
export const summarize = (type: JobType, cfg: FlowCfg, account: Account): string => {
	switch (type) {
		case "buy": {
			const strat =
				cfg.usage === "amount"
					? `Buy ${cfg.limit || 0} games`
					: cfg.usage === "balance"
						? `Spend ${cfg.limit || 0} ${cur(account)} on games`
						: cfg.usage === "next"
							? "Buy games until the next badge"
							: cfg.usage === "preview"
								? "Preview the cost to reach a badge"
								: "Buy games until the wallet is empty";
			const price = cfg.maxPrice ? `, max ${cfg.maxPrice} ${cur(account)} each` : "";
			const cards = cfg.priceOptionsFlag ? ", only games with trading cards" : "";
			return `${strat}${price}${cards}.`;
		}
		case "sell": {
			const n = SELLING_FLAGS.filter((x) => cfg.sellOptionsFlag & x.bit).length;
			const how = cfg.instantSell ? "Instantly sell" : "List";
			return `${how} ${n || 0} item type${n === 1 ? "" : "s"}, ${cfg.priceCalculation === "fixed" ? `${cfg.priceToRemove} ${cur(account)} below` : `${cfg.priceToRemove}% under`} market.`;
		}
		case "gems":
			return `Turn ${SELLING_FLAGS.filter((x) => cfg.sellOptionsFlag & x.bit).length || 0} item types into gems.`;
		case "cleanup":
			return cfg.removeAll ? "Remove ALL your market listings." : "Remove only overpriced listings.";
		case "redeem":
			return `Redeem ${csv(cfg.list).length} app(s).`;
		case "activate":
			return `Activate ${csv(cfg.keys).length} CD key(s).`;
	}
};
