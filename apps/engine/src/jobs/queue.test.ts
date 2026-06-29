import { expect, test } from "vitest";
import { JobQueue } from "./queue.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

test("respects the global concurrency cap", async () => {
	const q = new JobQueue({ concurrency: 2 });
	const gates = [deferred(), deferred(), deferred()];
	gates.forEach((g, i) =>
		q.submit({ id: `j${i}`, accountId: i + 1, run: () => g.promise }),
	);
	await flush();
	expect(q.runningCount).toBe(2);
	expect(q.pendingCount).toBe(1);

	gates[0]?.resolve();
	await flush();
	expect(q.runningCount).toBe(2); // the 3rd job took the freed slot
	expect(q.pendingCount).toBe(0);
});

test("serializes jobs for the same account (per-account lock)", async () => {
	const q = new JobQueue({ concurrency: 5 });
	const g1 = deferred();
	const g2 = deferred();
	let started2 = false;
	q.submit({ id: "a1", accountId: 7, run: () => g1.promise });
	q.submit({
		id: "a2",
		accountId: 7,
		run: () => {
			started2 = true;
			return g2.promise;
		},
	});
	await flush();
	expect(q.runningCount).toBe(1); // second blocked by the account lock
	expect(started2).toBe(false);

	g1.resolve();
	await flush();
	expect(started2).toBe(true);
});

test("cancel removes a pending job before it runs", async () => {
	const q = new JobQueue({ concurrency: 1 });
	const g = deferred();
	let ran = false;
	let status = "";
	q.submit({ id: "j1", accountId: 1, run: () => g.promise });
	q.submit({
		id: "j2",
		accountId: 2,
		run: async () => {
			ran = true;
		},
		onStatus: (s) => {
			status = s;
		},
	});
	await flush();
	expect(q.cancel("j2")).toBe(true);
	g.resolve();
	await flush();
	expect(ran).toBe(false);
	expect(status).toBe("canceled");
});

test("cancel fires the AbortSignal of a running job", async () => {
	const q = new JobQueue({ concurrency: 1 });
	const g = deferred();
	let aborted = false;
	q.submit({
		id: "j1",
		accountId: 1,
		run: (signal) => {
			signal.addEventListener("abort", () => {
				aborted = true;
			});
			return g.promise;
		},
	});
	await flush();
	expect(q.cancel("j1")).toBe(true);
	expect(aborted).toBe(true);
	g.resolve();
	await flush();
});

test("a failed job does not block the queue", async () => {
	const q = new JobQueue({ concurrency: 1 });
	let status1 = "";
	let ran2 = false;
	q.submit({
		id: "j1",
		accountId: 1,
		run: async () => {
			throw new Error("boom");
		},
		onStatus: (s) => {
			status1 = s;
		},
	});
	q.submit({
		id: "j2",
		accountId: 2,
		run: async () => {
			ran2 = true;
		},
	});
	await flush();
	expect(status1).toBe("failed");
	expect(ran2).toBe(true);
});
