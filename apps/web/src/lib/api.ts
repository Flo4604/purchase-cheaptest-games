// Typed client for the engine API (proxied at /api in dev — see vite.config.ts).
// Same-origin, so the httpOnly session cookie is sent automatically.

export interface Account {
	id: number;
	username: string;
	limit: string;
	usage: string;
	maxPrice: number;
	priceOptionsFlag: number;
	mode: string;
	hasSealedToken: boolean;
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

export interface UserInfo {
	id: number;
	email: string;
}

export const api = {
	register: (email: string, password: string) =>
		request<UserInfo>("/auth/register", {
			method: "POST",
			body: JSON.stringify({ email, password }),
		}),
	login: (email: string, password: string) =>
		request<UserInfo>("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email, password }),
		}),
	logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

	listAccounts: () => request<Account[]>("/accounts"),
	addAccount: (input: {
		username: string;
		refreshToken: string;
		config?: Record<string, unknown>;
	}) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(input) }),
	unlock: (accountId: number, password: string) =>
		request<{ ok: true }>(`/accounts/${accountId}/unlock`, {
			method: "POST",
			body: JSON.stringify({ password }),
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
