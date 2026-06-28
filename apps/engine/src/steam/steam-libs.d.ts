// The DoctorMcKay steam-* community libraries ship no type declarations. We type
// them loosely (index-signature classes) so the engine compiles; tightening
// these is out of scope for the Phase 1 port.

declare module "steamcommunity" {
	export default class SteamCommunity {
		constructor(options?: unknown);
		[key: string]: any;
	}
}

declare module "steamstore" {
	export default class SteamStore {
		constructor(options?: unknown);
		[key: string]: any;
	}
}

declare module "steam-tradeoffer-manager" {
	export default class TradeOfferManager {
		constructor(options?: unknown);
		[key: string]: any;
	}
}

declare module "steam-user" {
	export default class SteamUser {
		static EResult: any;
		constructor(options?: unknown);
		[key: string]: any;
	}
}
