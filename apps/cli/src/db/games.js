// LEGACY shim for the reference CLI only. New code (engine) uses `db` directly
// from @psg/db — do not grow this layer.
import { app, bundleApp, db } from "@psg/db";
import { eq } from "drizzle-orm";

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
	const rows = await db.select().from(app).where(eq(app.id, Number(id)));
	const found = rows[0];
	if (!found) return null;

	// Callers read `app.includedApps.length`, so it must always be an array.
	const includedApps = await db
		.select()
		.from(bundleApp)
		.where(eq(bundleApp.bundleId, found.id));

	return { ...found, includedApps };
};

const getLimitedGames = async () =>
	db.select().from(app).where(eq(app.limited, true));

export { addApp, getApp, updateGame, getLimitedGames };
