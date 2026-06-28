// In-memory store for unlocked KEKs, keyed by session id (WEBAPP_PLAN §3 session
// handling). The KEK lives only here, only for the session lifetime; expiry or
// logout wipes it (zeroes the buffer). Nothing is written to disk.

export interface KeyStoreEntry {
	kek: Buffer;
	expiresAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class KeyStore {
	private readonly entries = new Map<string, KeyStoreEntry>();

	constructor(
		private readonly ttlMs: number = DEFAULT_TTL_MS,
		// injectable clock for testing
		private readonly now: () => number = () => Date.now(),
	) {}

	set(sessionId: string, kek: Buffer): void {
		this.entries.set(sessionId, { kek, expiresAt: this.now() + this.ttlMs });
	}

	get(sessionId: string): Buffer | null {
		const entry = this.entries.get(sessionId);
		if (!entry) return null;
		if (this.now() > entry.expiresAt) {
			this.wipe(sessionId);
			return null;
		}
		return entry.kek;
	}

	/** Zero the key bytes and forget the session. */
	wipe(sessionId: string): void {
		const entry = this.entries.get(sessionId);
		if (entry) entry.kek.fill(0);
		this.entries.delete(sessionId);
	}

	wipeAll(): void {
		for (const id of [...this.entries.keys()]) this.wipe(id);
	}
}
