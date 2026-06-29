import { QrLoginManager } from "../auth/index.js";
import { JobQueue, JobService, ProgressHub } from "../jobs/index.js";
import { SessionStore } from "./session.js";

// Process-wide singletons shared across requests. The engine is a single Node
// process (WEBAPP_PLAN §2), so plain in-memory instances are correct here.
export interface AppContext {
	readonly sessions: SessionStore;
	readonly qr: QrLoginManager;
	readonly queue: JobQueue;
	readonly hub: ProgressHub;
	readonly jobs: JobService;
}

export const createAppContext = (concurrency = 4): AppContext => {
	const sessions = new SessionStore();
	const qr = new QrLoginManager();
	const hub = new ProgressHub();
	const queue = new JobQueue({ concurrency });
	const jobs = new JobService(queue, hub);
	return { sessions, qr, queue, hub, jobs };
};
