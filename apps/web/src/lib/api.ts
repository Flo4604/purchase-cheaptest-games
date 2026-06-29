// Typed client for the engine API (proxied at /api in dev — see vite.config.ts).
// Same-origin, so the httpOnly session cookie is sent automatically.

export interface Account {
	id: number;
	steamId: string;
	username: string;
	avatarUrl: string | null;
	limit: string;
	usage: string;
	maxPrice: number;
	priceOptionsFlag: number;
	mode: string;
	cachedWalletBalance: number | null;
	cachedWalletCurrency: string | null;
	cachedOwnedCount: number | null;
	cachedAt: string | null;
}

export interface Job {
	id: number;
	accountId: number;
	type: string;
	status: "queued" | "running" | "done" | "failed" | "canceled";
	paramsJson: string | null;
	progressJson: string | null;
	error: string | null;
	createdAt: string;
	finishedAt: string | null;
}

export interface ProgressEvent {
	step: string;
	current: number;
	total: number;
	message: string;
	level: "info" | "warn" | "error";
}

export type JobType = "buy" | "sell" | "cleanup" | "gems" | "redeem" | "activate";

export type QrStatus = "pending" | "authenticated" | "timeout" | "error";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
	const res = await fetch(`/api${path}`, {
		...init,
		headers: { "content-type": "application/json", ...init?.headers },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
	}
	return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
};

export const api = {
	// Steam QR login (and add-account when already signed in — the engine decides
	// based on the session cookie).
	qrStart: () =>
		request<{ qrId: string; challengeUrl: string }>("/auth/qr/start", {
			method: "POST",
		}),
	qrStatus: (qrId: string) =>
		request<{ status: QrStatus }>(`/auth/qr/${qrId}`),
	logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

	listAccounts: () => request<Account[]>("/accounts"),
	refreshAccount: (accountId: number) =>
		request<{ jobId: number }>(`/accounts/${accountId}/refresh`, {
			method: "POST",
		}),

	startJob: (accountId: number, type: JobType, params: Record<string, unknown>) =>
		request<{ jobId: number }>(`/accounts/${accountId}/jobs`, {
			method: "POST",
			body: JSON.stringify({ type, params }),
		}),
	listJobs: (accountId: number) => request<Job[]>(`/accounts/${accountId}/jobs`),
	getJob: (jobId: number) => request<Job>(`/jobs/${jobId}`),
	cancelJob: (jobId: number) =>
		request<{ canceled: boolean }>(`/jobs/${jobId}/cancel`, { method: "POST" }),
};
