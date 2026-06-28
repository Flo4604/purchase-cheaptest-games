// Progress abstraction that replaces the CLI's `logger` (consola) and
// `cli-progress` bars. Flows emit through a ProgressSink; the CLI can back it
// with a console, and the engine's WS layer (Phase 4) backs it with a stream
// that pushes @psg/core ProgressEvents to the client.

export interface ProgressBar {
	/** Set the absolute current value. */
	update(current: number, payload?: Record<string, unknown>): void;
	/** Advance by `step` (default 1). */
	increment(step?: number, payload?: Record<string, unknown>): void;
	/** Adjust the total after creation. */
	setTotal(total: number): void;
	/** Finish the bar. */
	stop(): void;
}

export interface ProgressSink {
	log(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	/** Begin a determinate progress bar for a long step. */
	startBar(step: string, total: number, startValue?: number): ProgressBar;
}

class ConsoleBar implements ProgressBar {
	private current: number;
	constructor(
		private readonly step: string,
		private total: number,
		startValue = 0,
	) {
		this.current = startValue;
		this.render();
	}
	private render(): void {
		const pct = this.total > 0 ? Math.floor((this.current / this.total) * 100) : 0;
		process.stdout.write(`\r${this.step}: ${this.current}/${this.total} (${pct}%)`);
	}
	update(current: number): void {
		this.current = current;
		this.render();
	}
	increment(step = 1): void {
		this.current += step;
		this.render();
	}
	setTotal(total: number): void {
		this.total = total;
		this.render();
	}
	stop(): void {
		process.stdout.write("\n");
	}
}

/** Default sink: writes to the console. Used by the CLI and as a dev fallback. */
export class ConsoleProgressSink implements ProgressSink {
	log(message: string, ...args: unknown[]): void {
		console.log(message, ...args);
	}
	info(message: string, ...args: unknown[]): void {
		console.info(message, ...args);
	}
	warn(message: string, ...args: unknown[]): void {
		console.warn(message, ...args);
	}
	error(message: string, ...args: unknown[]): void {
		console.error(message, ...args);
	}
	startBar(step: string, total: number, startValue = 0): ProgressBar {
		return new ConsoleBar(step, total, startValue);
	}
}

/** Sink that swallows everything — handy for tests. */
export class SilentProgressSink implements ProgressSink {
	log(): void {}
	info(): void {}
	warn(): void {}
	error(): void {}
	startBar(): ProgressBar {
		return {
			update() {},
			increment() {},
			setTotal() {},
			stop() {},
		};
	}
}
