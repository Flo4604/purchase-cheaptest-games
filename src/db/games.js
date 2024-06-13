import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const addApp = async (app) => {
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
		includedApps,
	} = app;

	try {
		await prisma.app.upsert({
			create: {
				name,
				originatingSnr,
				snr,
				subId: Number(subId),
				price: Number(price),
				id: Number(id),
				hasTradingCards,
				isBundle,
				includedApps,
				limited,
			},
			update: {
				name,
				originatingSnr,
				snr,
				subId: Number(subId),
				price: Number(price),
				id: Number(id),
				limited,
				hasTradingCards,
				includedApps,
				isBundle,
			},
			where: { id: Number(id) },
		});
	} catch (error) {
		console.error(error.message);
	}
};

const updateGame = async (id, limited, hasTradingCards) => {
	try {
		await prisma.app.update({
			where: { id: Number(id) },
			data: { limited, hasTradingCards },
		});
	} catch (error) {
		console.error(error.message);
	}
};

const getApp = async (id) =>
	prisma.app.findUnique({
		where: { id: Number(id) },
		include: { includedApps: true },
	});

const getLimitedGames = async () =>
	prisma.app.findMany({
		where: { limited: true },
	});

export { addApp, getApp, updateGame, getLimitedGames };
