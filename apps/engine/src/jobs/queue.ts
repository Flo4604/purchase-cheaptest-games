import type { JobStatus } from "@psg/core";

// In-memory job queue (WEBAPP_PLAN §6). Enforces:
//   - a global concurrency cap (across all accounts)
//   - a per-account lock (at most one running job per account)
//   - queue-and-wait: jobs over the cap / behind a locked account wait in FIFO
//   - cancel: pending jobs never start; running jobs get an AbortSignal
// Cancelling a running job does NOT free its slot until the flow actually returns
// — we never hard-kill a flow mid-Steam-call (could orphan a purchase).

export interface QueueJob {
	readonly id: string;
	readonly accountId: number;
	/** The work. Receives an AbortSignal for cooperative cancellation. */
	readonly run: (signal: AbortSignal) => Promise<void>;
	/** Called on every status transition (queued→running→done/failed/canceled). */
	readonly onStatus?: (status: JobStatus, error?: unknown) => void;
}

interface Tracked extends QueueJob {
	status: JobStatus;
	controller: AbortController;
}

export interface JobQueueOptions {
	/** Max jobs running at once across all accounts. */
	concurrency: number;
}

export class JobQueue {
	private readonly pending: Tracked[] = [];
	private readonly running = new Map<string, Tracked>();
	private readonly busyAccounts = new Set<number>();
	private readonly concurrency: number;

	constructor(opts: JobQueueOptions) {
		this.concurrency = Math.max(1, opts.concurrency);
	}

	get runningCount(): number {
		return this.running.size;
	}
	get pendingCount(): number {
		return this.pending.length;
	}

	submit(job: QueueJob): void {
		const tracked: Tracked = {
			...job,
			status: "queued",
			controller: new AbortController(),
		};
		this.pending.push(tracked);
		job.onStatus?.("queued");
		this.dispatch();
	}

	/** Cancel a pending or running job. Returns false if the id is unknown. */
	cancel(id: string): boolean {
		const idx = this.pending.findIndex((j) => j.id === id);
		if (idx >= 0) {
			const [job] = this.pending.splice(idx, 1);
			if (job) {
				job.status = "canceled";
				job.onStatus?.("canceled");
			}
			return true;
		}
		const running = this.running.get(id);
		if (running) {
			running.status = "canceled";
			running.controller.abort();
			running.onStatus?.("canceled");
			return true;
		}
		return false;
	}

	private dispatch(): void {
		for (
			let i = 0;
			i < this.pending.length && this.running.size < this.concurrency;

		) {
			const job = this.pending[i];
			// Account already running a job → leave this one pending, look further.
			if (!job || this.busyAccounts.has(job.accountId)) {
				i += 1;
				continue;
			}
			this.pending.splice(i, 1);
			this.start(job);
		}
	}

	private start(job: Tracked): void {
		this.running.set(job.id, job);
		this.busyAccounts.add(job.accountId);
		job.status = "running";
		job.onStatus?.("running");

		job
			.run(job.controller.signal)
			.then(() => {
				if (job.status !== "canceled") {
					job.status = "done";
					job.onStatus?.("done");
				}
			})
			.catch((error) => {
				if (job.status !== "canceled") {
					job.status = "failed";
					job.onStatus?.("failed", error);
				}
			})
			.finally(() => {
				this.running.delete(job.id);
				this.busyAccounts.delete(job.accountId);
				this.dispatch();
			});
	}
}
