import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Schema mirrors the existing (Prisma-created) SQLite tables exactly so we can
// keep querying the same db file. Notes on encoding compatibility:
//   - booleans were stored by Prisma as 0/1   -> integer({ mode: "boolean" })
//   - DateTime was stored as epoch ms integers -> integer({ mode: "timestamp_ms" })
// Table names keep their original PascalCase.

export const account = sqliteTable("Account", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	username: text("username").notNull().unique(),
	accessToken: text("accessToken").notNull(),
	refreshToken: text("refreshToken").notNull(),
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
