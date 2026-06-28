import { writeFileSync } from "node:fs";
import type { SteamSession } from "../session.js";
import type { RedeemConfig } from "../types.js";

export const redeemApps = async (
	session: SteamSession,
	config: RedeemConfig,
): Promise<void> =>
	// biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
	new Promise<void>(async (resolve) => {
		for (const subId of config.list) {
			const req = await session.postRequest(
				`https://store.steampowered.com/freelicense/addfreelicense/${subId}`,
				{ sessionid: session.sessionId },
			);

			writeFileSync(`./debug/redeemApps_${subId}.html`, req as string);
		}
		resolve();
	});
