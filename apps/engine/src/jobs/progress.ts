import type { ProgressEvent } from "@psg/core";
import type { ProgressBar, ProgressSink } from "../steam/progress.js";

export type ProgressListener = (event: ProgressEvent) => void;

// Per-job pub/sub for progress events. The WS/SSE layer subscribes by job id; the
// latest event is kept as a snapshot for late subscribers and DB persistence.
export class ProgressHub {
	private readonly listeners = new Map<string, Set<ProgressListener>>();
	private readonly latest = new Map<string, ProgressEvent>();

	publish(jobId: string, event: ProgressEvent): void {
		this.latest.set(jobId, event);
		const set = this.listeners.get(jobId);
		if (set) for (const listener of set) listener(event);
	}

	subscribe(jobId: string, listener: ProgressListener): () => void {
		let set = this.listeners.get(jobId);
		if (!set) {
			set = new Set();
			this.listeners.set(jobId, set);
		}
		set.add(listener);
		return () => {
			set?.delete(listener);
			if (set && set.size === 0) this.listeners.delete(jobId);
		};
	}

	snapshot(jobId: string): ProgressEvent | null {
		return this.latest.get(jobId) ?? null;
	}

	clear(jobId: string): void {
		this.latest.delete(jobId);
		this.listeners.delete(jobId);
	}
}

const format = (message: string, args: unknown[]): string =>
	args.length ? `${message} ${args.map(String).join(" ")}` : message;

// A ProgressSink that republishes everything a flow emits to the ProgressHub,
// turning logger-style calls and bars into typed ProgressEvents.
export class StreamingProgressSink implements ProgressSink {
	constructor(
		private readonly hub: ProgressHub,
		private readonly jobId: string,
	) {}

	private emit(
		level: ProgressEvent["level"],
		message: string,
		step = "log",
		current = 0,
		total = 0,
	): void {
		this.hub.publish(this.jobId, { step, current, total, message, level });
	}

	log(message: string, ...args: unknown[]): void {
		this.emit("info", format(message, args));
	}
	info(message: string, ...args: unknown[]): void {
		this.emit("info", format(message, args));
	}
	warn(message: string, ...args: unknown[]): void {
		this.emit("warn", format(message, args));
	}
	error(message: string, ...args: unknown[]): void {
		this.emit("error", format(message, args));
	}

	startBar(step: string, total: number, startValue = 0): ProgressBar {
		let current = startValue;
		let totalState = total;
		const publish = (message?: string) =>
			this.hub.publish(this.jobId, {
				step,
				current,
				total: totalState,
				message: message ?? step,
				level: "info",
			});
		publish();
		return {
			update: (value) => {
				current = value;
				publish();
			},
			increment: (by = 1) => {
				current += by;
				publish();
			},
			setTotal: (value) => {
				totalState = value;
				publish();
			},
			stop: () => {},
		};
	}
}
