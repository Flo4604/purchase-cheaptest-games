import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { app, bundleApp } from "./schema.js";

const addApp = async (appData) => {
	const {
		name,
		originatingSnr,
		snr,
		subId,
		appId: id,
		price,
		limited,
		hasTradingCards,
		isBundle,
	} = appData;

	const values = {
		id: Number(id),
		name,
		subId: Number(subId),
		snr,
		originatingSnr,
		price: Number(price),
		limited: Boolean(limited),
		hasTradingCards: Boolean(hasTradingCards),
		isBundle: Boolean(isBundle),
	};

	try {
		await db
			.insert(app)
			.values(values)
			.onConflictDoUpdate({
				target: app.id,
				set: {
					name: values.name,
					subId: values.subId,
					snr: values.snr,
					originatingSnr: values.originatingSnr,
					price: values.price,
					limited: values.limited,
					hasTradingCards: values.hasTradingCards,
					isBundle: values.isBundle,
				},
			});
	} catch (error) {
		console.error(error.message);
	}
};

const updateGame = async (id, limited, hasTradingCards) => {
	try {
		await db
			.update(app)
			.set({
				limited: Boolean(limited),
				hasTradingCards: Boolean(hasTradingCards),
			})
			.where(eq(app.id, Number(id)));
	} catch (error) {
		console.error(error.message);
	}
};

const getApp = async (id) => {
	const rows = await db
		.select()
		.from(app)
		.where(eq(app.id, Number(id)));
	const found = rows[0];
	if (!found) return null;

	// Mirror Prisma's `include: { includedApps: true }`. The BundleApp relation is
	// effectively unused (table stays empty), but callers read
	// `app.includedApps.length`, so it must always be an array.
	const includedApps = await db
		.select()
		.from(bundleApp)
		.where(eq(bundleApp.bundleId, found.id));

	return { ...found, includedApps };
};

const getLimitedGames = async () =>
	db.select().from(app).where(eq(app.limited, true));

export { addApp, getApp, updateGame, getLimitedGames };
