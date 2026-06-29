import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Schema mirrors the existing (Prisma-created) SQLite tables exactly so we can
// keep querying the same db file. Notes on encoding compatibility:
//   - booleans were stored by Prisma as 0/1   -> integer({ mode: "boolean" })
//   - DateTime was stored as epoch ms integers -> integer({ mode: "timestamp_ms" })
// Table names keep their original PascalCase.

// Owns Steam accounts. Stores only password-derived material — never the KEK
// (which is derived from the password at login and held in memory only).
export const user = sqliteTable("User", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	authHash: text("authHash").notNull(),
	saltAuth: text("saltAuth").notNull(),
	saltKek: text("saltKek").notNull(),
	createdAt: integer("createdAt", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const account = sqliteTable("Account", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	// Web (zero-knowledge) path: the Steam refresh token is envelope-encrypted
	// under the user's KEK (@psg/crypto). Nullable so legacy CLI rows are valid.
	userId: integer("userId").references(() => user.id),
	wrappedDek: text("wrappedDek"),
	dekNonce: text("dekNonce"),
	encryptedRefreshToken: text("encryptedRefreshToken"),
	tokenNonce: text("tokenNonce"),
	// Cached read-only display values, refreshed by a "refresh" job (needs a
	// Steam login). Shown on the dashboard without re-logging-in every render.
	cachedWalletBalance: real("cachedWalletBalance"),
	cachedWalletCurrency: text("cachedWalletCurrency"),
	cachedOwnedCount: integer("cachedOwnedCount"),
	cachedAt: integer("cachedAt", { mode: "timestamp_ms" }),
	limit: text("limit").notNull().default("0"),
	usage: text("usage").notNull().default("max"),
	maxPrice: real("maxPrice").notNull().default(0),
	priceOptionsFlag: integer("priceOptionsFlag").notNull().default(0),
	mode: text("mode").notNull().default("buy"),
});

export const app = sqliteTable("App", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	subId: integer("subId").notNull(),
	snr: text("snr").notNull(),
	originatingSnr: text("originatingSnr").notNull(),
	price: real("price").notNull(),
	limited: integer("limited", { mode: "boolean" }).notNull().default(false),
	hasTradingCards: integer("hasTradingCards", { mode: "boolean" })
		.notNull()
		.default(false),
	isBundle: integer("isBundle", { mode: "boolean" }).notNull().default(false),
});

export const bundleApp = sqliteTable("BundleApp", {
	bundleId: integer("bundleId").primaryKey({ autoIncrement: true }),
	appId: integer("appId").notNull(),
});

// Backs the job queue, history, and resumable progress (WEBAPP_PLAN §4/§6).
export const job = sqliteTable("Job", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	accountId: integer("accountId")
		.notNull()
		.references(() => account.id),
	type: text("type").notNull(), // buy|sell|cleanup|gems|redeem|activate
	status: text("status").notNull().default("queued"), // queued|running|done|failed|canceled
	paramsJson: text("paramsJson"),
	progressJson: text("progressJson"),
	error: text("error"),
	createdAt: integer("createdAt", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
	finishedAt: integer("finishedAt", { mode: "timestamp_ms" }),
});

export const activatedKey = sqliteTable("ActivatedKey", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	productKey: text("productKey").notNull().unique(),
	accountId: integer("accountId").notNull(),
	activatedAt: integer("activatedAt", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
	success: integer("success", { mode: "boolean" }).notNull(),
	packageId: text("packageId"),
	errorMessage: text("errorMessage"),
});
