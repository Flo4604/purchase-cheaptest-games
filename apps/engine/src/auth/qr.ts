import { randomUUID } from "node:crypto";
import { EAuthTokenPlatformType, LoginSession } from "steam-session";

export type QrStatus = "pending" | "authenticated" | "timeout" | "error";

interface Pending {
	status: QrStatus;
	challengeUrl: string;
	// Set when the scan was started by an already-signed-in user (add-account).
	initiatingUserId?: number;
	result?: { steamId: string; accountName: string; refreshToken: string };
	error?: string;
	// Held so the polling LoginSession isn't garbage-collected mid-flow.
	session: LoginSession;
}

/** In-memory Steam QR logins in flight, keyed by a short qrId the client polls. */
export class QrLoginManager {
	private readonly pending = new Map<string, Pending>();

	async start(
		initiatingUserId?: number,
	): Promise<{ qrId: string; challengeUrl: string }> {
		const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
		session.loginTimeout = 120_000;
		const startResult = await session.startWithQR();
		const challengeUrl = startResult.qrChallengeUrl;
		if (!challengeUrl) throw new Error("failed to start Steam QR login");
		const qrId = randomUUID();

		const entry: Pending = {
			status: "pending",
			challengeUrl,
			initiatingUserId,
			session,
		};
		this.pending.set(qrId, entry);

		session.on("authenticated", () => {
			entry.status = "authenticated";
			entry.result = {
				steamId: String(session.steamID),
				accountName: session.accountName,
				refreshToken: session.refreshToken,
			};
		});
		session.on("timeout", () => {
			entry.status = "timeout";
		});
		session.on("error", (err: { message?: string }) => {
			entry.status = "error";
			entry.error = err.message;
		});

		return { qrId, challengeUrl };
	}

	get(qrId: string): Pending | null {
		return this.pending.get(qrId) ?? null;
	}

	consume(qrId: string): void {
		this.pending.delete(qrId);
	}
}
