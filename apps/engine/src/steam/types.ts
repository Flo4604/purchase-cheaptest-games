// Shared types for the Steam engine. The per-flow config interfaces mirror the
// objects the CLI's config.js prompts build; the web API (Phase 4) builds the
// same shapes from request params.

export interface Wallet {
	hasWallet: boolean;
	currency: string;
	balance: number;
}

/** A stored Steam account as the engine needs it to log in. */
export interface LoginAccount {
	id: number;
	username: string;
	refreshToken: string;
	accessToken?: string;
}

export interface LoginResult {
	sessionId: string;
	accessToken: string;
}

/** App/game record as it flows through catalog → cart. Loosely typed (with an
 * index signature) so the faithful port can read fields without friction. */
export interface GameApp {
	appId: number | string;
	id?: number;
	name?: string;
	price: number;
	subId?: number | string;
	snr?: string;
	originatingSnr?: string;
	limited?: boolean;
	hasTradingCards?: boolean;
	isBundle?: boolean;
	includedApps?: unknown[];
	isInDb?: boolean;
	[key: string]: unknown;
}

export interface BuyConfig {
	mode?: "buy";
	usage: string;
	limit: number | string;
	maxPrice: number | string;
	priceOptionsFlag: number;
}

export interface SellConfig {
	mode?: "sell";
	sellOptionsFlag: number;
	minPrice: number;
	priceToRemove: number | string;
	priceCalculation: "fixed" | "percentage";
	instantSell: boolean;
	instantSellThreshold: number;
}

export interface GemConfig {
	mode?: "sell";
	sellOptionsFlag: number;
	priceToRemove: number | string;
	priceCalculation: "fixed" | "percentage";
}

export interface CleanupConfig {
	mode?: "cleanup";
	removeAll: boolean;
}

export interface RedeemConfig {
	mode?: "redeemApps";
	list: string[];
}

export interface ActivateConfig {
	mode?: "activateKeys";
	keys: string[];
	accountId: number;
}
