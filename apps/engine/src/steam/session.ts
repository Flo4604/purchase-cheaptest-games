import { SteamAuthExpired } from "@psg/core";
import { Effect, ManagedRuntime } from "effect";
import { EAuthTokenPlatformType, LoginSession } from "steam-session";
import SteamCommunity from "steamcommunity";
import TradeOfferManager from "steam-tradeoffer-manager";
import SteamUser from "steam-user";
import SteamStore from "steamstore";
import {
	axiosGet,
	communityGet,
	communityPost,
	defaultHttpConfig,
	harden,
	type SteamHttpConfig,
	SteamLimiter,
	SteamLimiterLive,
} from "./http.js";
import type { ProgressSink } from "./progress.js";
import { ConsoleProgressSink } from "./progress.js";
import type { LoginAccount, LoginResult } from "./types.js";

/**
 * A single logged-in Steam account session. Owns the long-lived steam-user CM
 * connection plus the steamcommunity / steamstore / trade-manager cookie jars.
 * Replaces the module-global clients in the old steam.js.
 */
export class SteamSession {
	readonly community = new SteamCommunity();
	readonly store = new SteamStore();
	readonly client = new SteamUser();
	readonly manager: TradeOfferManager;
	readonly progress: ProgressSink;

	cookies: string[] = [];
	countryCode = "";
	// Populated by login(); replaces the old global.sessionId / global.accessToken
	// the CLI set after logging in. Used to build authenticated request URLs.
	sessionId = "";
	accessToken = "";

	readonly httpConfig: SteamHttpConfig;
	// Long-lived Effect runtime that provides the shared RateLimiter. All Steam
	// HTTP runs through it so pacing/retry/typed-errors apply uniformly.
	private readonly runtime: ManagedRuntime.ManagedRuntime<SteamLimiter, never>;

	constructor(
		progress: ProgressSink = new ConsoleProgressSink(),
		httpConfig: SteamHttpConfig = defaultHttpConfig,
	) {
		this.progress = progress;
		this.httpConfig = httpConfig;
		this.runtime = ManagedRuntime.make(SteamLimiterLive(httpConfig));
		this.manager = new TradeOfferManager({
			steam: this.client,
			domain: "example.com",
			language: "en",
		});
	}

	/** Release the rate-limiter runtime. Call when the session is done. */
	dispose(): Promise<void> {
		return this.runtime.dispose();
	}

	// [ HTTP REQUESTS ]
	// Each call is rate-limited + retried with backoff (see http.ts). Terminal
	// failures map back to the legacy contract (`false`/`undefined`) so callers
	// don't change.

	getApiCall(url: string, params?: unknown): Promise<unknown> {
		return this.runtime.runPromise(
			harden(axiosGet(url, params), this.httpConfig).pipe(
				Effect.tapError((e) =>
					Effect.sync(() => this.progress.warn(`GET ${url} failed`, e._tag)),
				),
				Effect.catchAll(() => Effect.succeed<unknown>(undefined)),
			),
		);
	}

	postRequest(
		url: string,
		data: unknown,
		headers: Record<string, unknown> = {},
		debug = false,
	): Promise<unknown> {
		return this.runtime.runPromise(
			harden(
				communityPost(this.community, url, data, headers, debug),
				this.httpConfig,
			).pipe(
				Effect.tapError((e) =>
					Effect.sync(() => {
						if (e._tag !== "SteamRateLimited")
							this.progress.warn(`POST ${url} failed`, e._tag);
					}),
				),
				Effect.catchAll(() => Effect.succeed<unknown>(false)),
			),
		);
	}

	getRequest(
		url: string,
		headers: Record<string, unknown> = {},
		debug = false,
	): Promise<unknown> {
		return this.runtime.runPromise(
			harden(
				communityGet(this.community, url, headers, debug),
				this.httpConfig,
			).pipe(
				Effect.tapError((e) =>
					Effect.sync(() => {
						if (e._tag !== "SteamRateLimited")
							this.progress.warn(`GET ${url} failed`, e._tag);
					}),
				),
				Effect.catchAll(() => Effect.succeed<unknown>(false)),
			),
		);
	}

	responseToJSON(response: string): unknown {
		try {
			return JSON.parse(response);
		} catch (e) {
			this.progress.error(String(e), { response });
			return false;
		}
	}

	balanceToAmount(
		input: string,
	): { currency: string; amount: number } | false {
		let string = input;
		string = string.replace("€", "EUR");
		string = string.replace("--", "00");

		const currencyMatch = string.match(/([A-Z]{1,})/);
		const currency = currencyMatch ? currencyMatch[0] : "";
		const amountMatch = string.match(/(\d+(?:.(\d+)){1,})/) || [];
		const amount = amountMatch[0];

		// 2,--EUR deal with that

		if (!amount) {
			this.progress.error("Unable to parse amount from string:", string);
			return false;
		}

		const parsedAmount =
			Number.parseFloat(amount.replace(/,/g, "").replace(/\./, "")) / 100;

		return { currency, amount: parsedAmount };
	}

	// [ Login ]

	setCookies(cookies: string[]): void {
		this.store.setCookies(cookies);

		cookies.push(
			"wants_mature_content=1",
			"lastagecheckage=1-January-2000",
			"birthtime=946681201",
		);
		this.community.setCookies(cookies);

		this.manager.setCookies(cookies, (err: { message?: string } | null) => {
			if (err) {
				// Was process.exit(1) in the CLI; in the engine we surface it so the
				// job fails cleanly instead of killing the whole service.
				throw new Error(`Failed to set trade-manager cookies: ${err.message}`);
			}
			this.progress.log(
				`Got API Key ${this.manager?.apiKey?.replace(/\w/gi, "*")}`,
			);
		});
	}

	/**
	 * Log in with a stored refresh token and return the web session id + access
	 * token. If the refresh token has expired (EResult.Expired) we throw
	 * SteamAuthExpired — the interactive QR re-auth lives in the add-account flow
	 * (Phase 3), not in headless job execution.
	 */
	login(account: LoginAccount): Promise<LoginResult> {
		return new Promise<LoginResult>((resolve, reject) => {
			const onError = (err: { eresult?: number }) => {
				this.client.removeListener("webSession", onWebSession);

				if (err.eresult === SteamUser.EResult.Expired) {
					reject(new SteamAuthExpired({ accountId: account.id }));
					return;
				}

				reject(err as Error);
			};

			const onWebSession = async (_sessionID: string, cookies: string[]) => {
				this.client.removeListener("error", onError);
				this.setCookies(cookies);

				const session = new LoginSession(EAuthTokenPlatformType.WebBrowser);
				session.refreshToken = account.refreshToken;
				const webCookies: string[] = await session.getWebCookies();
				this.community.setCookies(webCookies);

				cookies.push(
					...webCookies
						.filter((cookie) =>
							cookie.includes("Domain=checkout.steampowered.com"),
						)
						.map((cookie) => cookie.split(";")[0] as string),
				);

				// preserve the old behaviour (rebuilds the array reference)
				cookies = cookies.splice(0);

				this.cookies = cookies;

				const newSessionId = (
					cookies.find((cookie) => cookie.includes("sessionid")) as string
				)
					.split(";")[0]!
					.split("=")[1] as string;

				const accessToken = (
					cookies.find((cookie) =>
						cookie.includes("steamLoginSecure"),
					) as string
				)
					.split(";")[0]!
					.split("=")[1]!
					.split("%7C%7C")[1] as string;

				this.sessionId = newSessionId;
				this.accessToken = accessToken;

				resolve({ sessionId: newSessionId, accessToken });
			};

			this.client.once("error", onError);
			this.client.once("webSession", onWebSession);

			this.client.logOn({ refreshToken: account.refreshToken });
		});
	}
}
