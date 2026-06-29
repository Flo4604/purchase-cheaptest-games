import SteamID from "steamid";
import { SteamSession } from "./session.js";
import type { ProgressSink } from "./progress.js";
import { getOwnedApps, getOwnedAppsCount } from "./ops/apps.js";
import { getWalletBalance } from "./ops/wallet.js";
import { activateKeys } from "./flows/activateKeys.js";
import { buyGames } from "./flows/buyGames.js";
import { redeemApps } from "./flows/redeemApps.js";
import { removeOverpricedItems } from "./flows/removeOverpriced.js";
import { sellItems } from "./flows/sellItems.js";
import { turnIntoGems } from "./flows/turnIntoGems.js";
import type {
	ActivateConfig,
	BuyConfig,
	CleanupConfig,
	GemConfig,
	LoginAccount,
	RedeemConfig,
	SellConfig,
	Wallet,
} from "./types.js";

/**
 * Public facade over a single logged-in Steam account session. Mirrors the
 * flows the CLI exposes (WEBAPP_PLAN §5). Each call delegates to a focused op or
 * flow module, threading the shared SteamSession. Progress is emitted through
 * the injected ProgressSink (the WS layer supplies one in Phase 4).
 *
 * Effect-ification (RateLimiter / retry / typed errors) is Phase 2 — this layer
 * is a faithful, plain-async wrapper with no behavior change from the CLI.
 */
export class SteamEngine {
	readonly session: SteamSession;

	constructor(progress?: ProgressSink) {
		this.session = new SteamSession(progress);
	}

	/** Log in with a stored refresh token; throws SteamAuthExpired if it's dead. */
	login(account: LoginAccount) {
		return this.session.login(account);
	}

	// read helpers
	getWalletBalance() {
		return getWalletBalance(this.session);
	}
	getOwnedApps() {
		return getOwnedApps(this.session);
	}
	getOwnedAppsCount() {
		return getOwnedAppsCount(this.session);
	}
	/** Public Steam avatar URL for a SteamID (best-effort; null on failure). */
	getAvatarUrl(steamId: string): Promise<string | null> {
		return new Promise((resolve) => {
			try {
				this.session.community.getSteamUser(
					new SteamID(steamId),
					(err: unknown, profile: { getAvatarURL?: (size: string) => string }) => {
						if (err || !profile?.getAvatarURL) return resolve(null);
						try {
							resolve(profile.getAvatarURL("full"));
						} catch {
							resolve(null);
						}
					},
				);
			} catch {
				resolve(null);
			}
		});
	}

	// flows
	buyGames(
		config: BuyConfig,
		ownedApps: any[],
		ownedAppsRealCount: number,
		wallet: Wallet,
	) {
		return buyGames(this.session, config, ownedApps, ownedAppsRealCount, wallet);
	}
	sellItems(config: SellConfig, wallet: Wallet) {
		return sellItems(this.session, config, wallet);
	}
	/** "cleanup" flow — remove overpriced (or all) market listings. */
	cleanup(wallet: Wallet, config: CleanupConfig) {
		return removeOverpricedItems(this.session, wallet, config);
	}
	turnIntoGems(config: GemConfig, wallet: Wallet) {
		return turnIntoGems(this.session, config, wallet);
	}
	redeemApps(config: RedeemConfig) {
		return redeemApps(this.session, config);
	}
	activateKeys(config: ActivateConfig) {
		return activateKeys(this.session, config);
	}
}
