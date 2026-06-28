export const HIGHEST_GAME_BADGE = 32;

export const EXTRA_OPTIONS = {
	BUYING: {
		TRADING_CARDS: 1 << 0,
		TRADING_CARDS_LIMITED: 1 << 1,
	},
	SELLING: {
		ALL_TRADING_CARDS: 1 << 2,
		NORMAL_TRADING_CARDS: 1 << 3,
		FOIL_TRADING_CARDS: 1 << 4,
		BACKGROUNDS: 1 << 5,
		EMOTICONS: 1 << 6,
		PROFILE_BACKGROUNDS: 1 << 7,
		MINI_PROFILE_BACKGROUNDS: 1 << 8,
		STICKERS: 1 << 9,
		CHAT_EFFECTS: 1 << 10,
		ANIMATED_AVATARS: 1 << 11,
		AVATAR_FRAMES: 1 << 12,
	},
} as const;

export const MAX_PRICES: Record<string, number> = {
	ARS: 840,
	TL: 60,
	EUR: 60,
	R: 540_000,
};

export const CURRENCY_CODES: Record<string, number> = {
	ARS: 34,
	TL: 17,
	EUR: 3,
	R: 10,
};

export const BADGES: number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

export const TRANSLATION: Record<string, string> = {
	amount: "Buy certain amount of games",
	next: "Buy until the next badge",
	max: "Buy games until the wallet is empty",
	money: "Buy games for a certain amount of money",
	preview: "Preview how much money it would cost for a certain badge",
	TRADING_CARDS: "Trading Cards (Only Games that add to count)",
	TRADING_CARDS_LIMITED: "Trading Cards (All Games)",
	FOIL_TRADING_CARDS: "Foil Trading Cards",
	NORMAL_TRADING_CARDS: "Normal Trading Cards",
	ALL_TRADING_CARDS: "All Trading Cards",
	BACKGROUNDS: "Backgrounds",
	EMOTICONS: "Emoticons",
	PROFILE_BACKGROUNDS: "Profile Backgrounds",
	MINI_PROFILE_BACKGROUNDS: "Mini Profile Backgrounds",
	STICKERS: "Stickers",
	CHAT_EFFECTS: "Chat Effects",
	ANIMATED_AVATARS: "Animated Avatars",
	AVATAR_FRAMES: "Avatar Frames",
};
