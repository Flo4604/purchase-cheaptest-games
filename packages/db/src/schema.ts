import {
	boolean,
	integer,
	pgTable,
	real,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

// Postgres schema (runs on embedded pglite in dev, real Postgres in prod —
// same dialect, picked by DATABASE_URL in client.ts).

// Identity = the Steam account you logged in with via QR (by SteamID).
export const user = pgTable("User", {
	id: serial("id").primaryKey(),
	steamId: text("steamId").notNull().unique(),
	createdAt: timestamp("createdAt", { withTimezone: true })
		.notNull()
		.$defaultFn(() => new Date()),
});

// A Steam account a user has connected (via QR). The refresh token is
// envelope-encrypted under the server master key (@psg/crypto).
export const account = pgTable("Account", {
	id: serial("id").primaryKey(),
	userId: integer("userId")
		.notNull()
		.references(() => user.id),
	steamId: text("steamId").notNull(),
	username: text("username").notNull(),
	avatarUrl: text("avatarUrl"),
	wrappedDek: text("wrappedDek"),
	dekNonce: text("dekNonce"),
	encryptedRefreshToken: text("encryptedRefreshToken"),
	tokenNonce: text("tokenNonce"),
	// Cached read-only display values, refreshed by a "refresh" job.
	cachedWalletBalance: real("cachedWalletBalance"),
	cachedWalletCurrency: text("cachedWalletCurrency"),
	cachedOwnedCount: integer("cachedOwnedCount"),
	cachedAt: timestamp("cachedAt", { withTimezone: true }),
	limit: text("limit").notNull().default("0"),
	usage: text("usage").notNull().default("max"),
	maxPrice: real("maxPrice").notNull().default(0),
	priceOptionsFlag: integer("priceOptionsFlag").notNull().default(0),
	mode: text("mode").notNull().default("buy"),
});

// id is the Steam appId (set explicitly on insert), not auto-generated.
export const app = pgTable("App", {
	id: integer("id").primaryKey(),
	name: text("name").notNull(),
	subId: integer("subId").notNull(),
	snr: text("snr").notNull(),
	originatingSnr: text("originatingSnr").notNull(),
	price: real("price").notNull(),
	limited: boolean("limited").notNull().default(false),
	hasTradingCards: boolean("hasTradingCards").notNull().default(false),
	isBundle: boolean("isBundle").notNull().default(false),
});

export const bundleApp = pgTable("BundleApp", {
	bundleId: serial("bundleId").primaryKey(),
	appId: integer("appId").notNull(),
});

// Backs the job queue, history, and resumable progress (WEBAPP_PLAN §4/§6).
export const job = pgTable("Job", {
	id: serial("id").primaryKey(),
	accountId: integer("accountId")
		.notNull()
		.references(() => account.id),
	type: text("type").notNull(), // buy|sell|cleanup|gems|redeem|activate|refresh
	status: text("status").notNull().default("queued"),
	paramsJson: text("paramsJson"),
	progressJson: text("progressJson"),
	error: text("error"),
	createdAt: timestamp("createdAt", { withTimezone: true })
		.notNull()
		.$defaultFn(() => new Date()),
	finishedAt: timestamp("finishedAt", { withTimezone: true }),
});

export const activatedKey = pgTable("ActivatedKey", {
	id: serial("id").primaryKey(),
	productKey: text("productKey").notNull().unique(),
	accountId: integer("accountId").notNull(),
	activatedAt: timestamp("activatedAt", { withTimezone: true })
		.notNull()
		.$defaultFn(() => new Date()),
	success: boolean("success").notNull(),
	packageId: text("packageId"),
	errorMessage: text("errorMessage"),
});
