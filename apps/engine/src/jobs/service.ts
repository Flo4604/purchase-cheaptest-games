import type { JobType } from "@psg/core";
import { account, db, job as jobTable } from "@psg/db";
import { desc, eq } from "drizzle-orm";
import { getAccountRefreshToken } from "../auth/accounts.js";
import type { KeyStore } from "../auth/keystore.js";
import { SteamEngine } from "../steam/index.js";
import type {
	ActivateConfig,
	BuyConfig,
	CleanupConfig,
	GemConfig,
	RedeemConfig,
	SellConfig,
	Wallet,
} from "../steam/types.js";
import { ProgressHub, StreamingProgressSink } from "./progress.js";
import { JobQueue } from "./queue.js";

export type JobParams = Record<string, unknown> & { config?: unknown };

/**
 * Orchestrates a flow run end to end: create the Job row, enqueue it, and on a
 * free slot decrypt the account's refresh token with the session KEK, log into
 * Steam, run the requested flow with a streaming progress sink, and persist the
 * outcome. The queue enforces the concurrency cap + per-account lock.
 */
export class JobService {
	constructor(
		readonly queue: JobQueue,
		readonly hub: ProgressHub,
		private readonly keys: KeyStore,
	) {}

	// Insert a Job row, enqueue it, and wire status persistence. The runner gets
	// the created jobId so it streams progress to the right channel.
	private async enqueue(
		accountId: number,
		type: string,
		paramsJson: string | null,
		run: (jobId: string, signal: AbortSignal) => Promise<void>,
	): Promise<number> {
		const inserted = (
			await db
				.insert(jobTable)
				.values({ accountId, type, status: "queued", paramsJson })
				.returning()
		)[0];
		if (!inserted) throw new Error("failed to create job");
		const jobId = String(inserted.id);
		this.queue.submit({
			id: jobId,
			accountId,
			run: (signal) => run(jobId, signal),
			onStatus: (status, error) => {
				void this.persist(jobId, status, error);
			},
		});
		return inserted.id;
	}

	// Resolve the unlocked KEK + the account row, or throw.
	private async prepare(accountId: number, sessionId: string) {
		const kek = this.keys.get(sessionId);
		if (!kek) throw new Error("locked: unlock the account with your password first");
		const acct = (
			await db.select().from(account).where(eq(account.id, accountId))
		)[0];
		if (!acct) throw new Error("account not found");
		return { kek, acct };
	}

	async start(
		accountId: number,
		sessionId: string,
		type: JobType,
		params: JobParams,
	): Promise<number> {
		const { kek, acct } = await this.prepare(accountId, sessionId);
		return this.enqueue(
			accountId,
			type,
			JSON.stringify(params),
			async (jobId) => {
				const engine = new SteamEngine(new StreamingProgressSink(this.hub, jobId));
				try {
					await engine.login({
						id: acct.id,
						username: acct.username,
						refreshToken: getAccountRefreshToken(acct, kek),
					});
					const wallet = (await engine.getWalletBalance()) as Wallet;
					await this.runFlow(engine, type, params, wallet);
				} finally {
					await engine.session.dispose();
				}
			},
		);
	}

	// Refresh cached wallet balance + owned-game count for the dashboard.
	async startRefresh(accountId: number, sessionId: string): Promise<number> {
		const { kek, acct } = await this.prepare(accountId, sessionId);
		return this.enqueue(accountId, "refresh", null, async (jobId) => {
			const sink = new StreamingProgressSink(this.hub, jobId);
			const engine = new SteamEngine(sink);
			try {
				await engine.login({
					id: acct.id,
					username: acct.username,
					refreshToken: getAccountRefreshToken(acct, kek),
				});
				sink.info("Fetching wallet balance and owned games…");
				const wallet = (await engine.getWalletBalance()) as Wallet;
				const owned = (await engine.getOwnedAppsCount()) as number;
				await db
					.update(account)
					.set({
						cachedWalletBalance: wallet.balance,
						cachedWalletCurrency: wallet.currency,
						cachedOwnedCount: owned,
						cachedAt: new Date(),
					})
					.where(eq(account.id, accountId));
				sink.info(`Wallet ${wallet.balance} ${wallet.currency} · ${owned} games`);
			} finally {
				await engine.session.dispose();
			}
		});
	}

	private async runFlow(
		engine: SteamEngine,
		type: JobType,
		params: JobParams,
		wallet: Wallet,
	): Promise<void> {
		switch (type) {
			case "buy": {
				const ownedApps = (await engine.getOwnedApps()) as unknown[];
				const count = (await engine.getOwnedAppsCount()) as number;
				await engine.buyGames(
					params.config as BuyConfig,
					ownedApps as any[],
					count,
					wallet,
				);
				return;
			}
			case "sell":
				await engine.sellItems(params.config as SellConfig, wallet);
				return;
			case "cleanup":
				await engine.cleanup(wallet, params.config as CleanupConfig);
				return;
			case "gems":
				await engine.turnIntoGems(params.config as GemConfig, wallet);
				return;
			case "redeem":
				await engine.redeemApps(params.config as RedeemConfig);
				return;
			case "activate":
				await engine.activateKeys(params.config as ActivateConfig);
				return;
		}
	}

	private async persist(
		jobId: string,
		status: string,
		error?: unknown,
	): Promise<void> {
		const terminal =
			status === "done" || status === "failed" || status === "canceled";
		// Emit a terminal status event so live (SSE) subscribers can close.
		if (terminal) {
			this.hub.publish(jobId, {
				step: "status",
				current: 0,
				total: 0,
				message: status,
				level: status === "failed" ? "error" : "info",
			});
		}
		const snapshot = this.hub.snapshot(jobId);
		await db
			.update(jobTable)
			.set({
				status,
				error: error
					? String(
							(error as { _tag?: string })._tag ??
								(error as Error)?.message ??
								error,
						)
					: null,
				progressJson: snapshot ? JSON.stringify(snapshot) : null,
				finishedAt: terminal ? new Date() : null,
			})
			.where(eq(jobTable.id, Number(jobId)));
		if (terminal) this.hub.clear(jobId);
	}

	listForAccount(accountId: number) {
		return db
			.select()
			.from(jobTable)
			.where(eq(jobTable.accountId, accountId))
			.orderBy(desc(jobTable.createdAt));
	}

	get(jobId: number) {
		return db
			.select()
			.from(jobTable)
			.where(eq(jobTable.id, jobId))
			.then((rows) => rows[0] ?? null);
	}

	async cancel(jobId: number): Promise<boolean> {
		const ok = this.queue.cancel(String(jobId));
		if (ok) await this.persist(String(jobId), "canceled");
		return ok;
	}
}
