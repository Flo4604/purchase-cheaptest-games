import type { Account, JobType } from "./api.js";

// Form specs per flow type — mirror the configs the engine flows consume
// (originally built by the CLI's inquirer prompts).

export interface FlowField {
	name: string;
	label: string;
	kind: "text" | "number" | "select" | "checkbox" | "flags" | "csv";
	options?: { label: string; value: string }[];
	flags?: { label: string; bit: number }[];
	default?: string | number | boolean;
}

// Bitflags from the engine's constants (EXTRA_OPTIONS).
const BUYING_FLAGS = [
	{ label: "Trading cards (counts toward badge)", bit: 1 },
	{ label: "Trading cards (all games)", bit: 2 },
];
const SELLING_FLAGS = [
	{ label: "All trading cards", bit: 4 },
	{ label: "Normal trading cards", bit: 8 },
	{ label: "Foil trading cards", bit: 16 },
	{ label: "Backgrounds", bit: 32 },
	{ label: "Emoticons", bit: 64 },
	{ label: "Profile backgrounds", bit: 128 },
	{ label: "Mini profile backgrounds", bit: 256 },
	{ label: "Stickers", bit: 512 },
	{ label: "Chat effects", bit: 1024 },
	{ label: "Animated avatars", bit: 2048 },
	{ label: "Avatar frames", bit: 4096 },
];
const REDUCTION = [
	{ label: "Remove fixed amount", value: "fixed" },
	{ label: "Remove percentage", value: "percentage" },
];

export const FLOW_FIELDS: Record<JobType, FlowField[]> = {
	buy: [
		{
			name: "usage",
			label: "Strategy",
			kind: "select",
			default: "max",
			options: [
				{ label: "Until wallet empty", value: "max" },
				{ label: "Buy N games", value: "amount" },
				{ label: "Spend N balance", value: "balance" },
				{ label: "Until next badge", value: "next" },
				{ label: "Preview badge cost", value: "preview" },
			],
		},
		{ name: "limit", label: "Limit (games / balance)", kind: "number", default: 0 },
		{ name: "maxPrice", label: "Max price per game", kind: "number", default: 0 },
		{ name: "priceOptionsFlag", label: "Only games with", kind: "flags", flags: BUYING_FLAGS },
	],
	sell: [
		{ name: "sellOptionsFlag", label: "Item types", kind: "flags", flags: SELLING_FLAGS, default: 4 },
		{ name: "priceCalculation", label: "Price reduction", kind: "select", default: "fixed", options: REDUCTION },
		{ name: "priceToRemove", label: "Amount / percent to remove", kind: "number", default: 0.03 },
		{ name: "minPrice", label: "Min sell price (cents)", kind: "number", default: 0 },
		{ name: "instantSell", label: "Instant sell (to highest buy order)", kind: "checkbox", default: false },
		{ name: "instantSellThreshold", label: "Instant-sell max discount %", kind: "number", default: 50 },
	],
	gems: [
		{ name: "sellOptionsFlag", label: "Item types", kind: "flags", flags: SELLING_FLAGS, default: 4 },
		{ name: "priceCalculation", label: "Price reduction", kind: "select", default: "fixed", options: REDUCTION },
		{ name: "priceToRemove", label: "Amount / percent to remove", kind: "number", default: 0.03 },
	],
	cleanup: [
		{ name: "removeAll", label: "Remove ALL listings (not just overpriced)", kind: "checkbox", default: false },
	],
	redeem: [{ name: "list", label: "AppIDs (comma-separated)", kind: "csv" }],
	activate: [{ name: "keys", label: "CD keys (one per line or comma-separated)", kind: "csv" }],
};

export type FieldValue = string | number | boolean;

/** Initial form values for a flow; `buy` is pre-filled from the account's saved config. */
export const initialValues = (
	type: JobType,
	account: Account,
): Record<string, FieldValue> => {
	const values: Record<string, FieldValue> = {};
	for (const f of FLOW_FIELDS[type]) {
		values[f.name] = f.default ?? (f.kind === "flags" || f.kind === "number" ? 0 : f.kind === "checkbox" ? false : "");
	}
	if (type === "buy") {
		values.usage = account.usage;
		values.limit = Number(account.limit) || 0;
		values.maxPrice = account.maxPrice;
		values.priceOptionsFlag = account.priceOptionsFlag;
	}
	return values;
};

/** Build the engine `config` object from raw field values. */
export const buildConfig = (
	type: JobType,
	values: Record<string, FieldValue>,
	account: Account,
): Record<string, unknown> => {
	const config: Record<string, unknown> = {};
	for (const f of FLOW_FIELDS[type]) {
		const v = values[f.name];
		if (f.kind === "number" || f.kind === "flags") config[f.name] = Number(v);
		else if (f.kind === "checkbox") config[f.name] = Boolean(v);
		else if (f.kind === "csv")
			config[f.name] = String(v ?? "")
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean);
		else config[f.name] = v;
	}
	if (type === "activate") config.accountId = account.id;
	return config;
};
