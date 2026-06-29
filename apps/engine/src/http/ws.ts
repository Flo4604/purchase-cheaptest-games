import type { Server } from "node:http";
import { account, db, job as jobTable } from "@psg/db";
import { eq } from "drizzle-orm";
import { type WebSocket, WebSocketServer } from "ws";
import type { AppContext } from "./context.js";
import { COOKIE_NAME } from "./session.js";

// Live job progress over WebSocket at /jobs/:id/stream. Auth via the session
// cookie + ownership check happen during the HTTP upgrade, before we accept.

const STREAM_PATH = /^\/jobs\/(\d+)\/stream$/;

const parseCookie = (
	header: string | undefined,
	name: string,
): string | undefined => {
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return undefined;
};

export const attachWebSocket = (server: Server, ctx: AppContext): void => {
	const wss = new WebSocketServer({ noServer: true });

	server.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const match = url.pathname.match(STREAM_PATH);
		if (!match) {
			socket.destroy();
			return;
		}
		const jobId = Number(match[1]);
		const session = ctx.sessions.get(
			parseCookie(req.headers.cookie, COOKIE_NAME),
		);
		if (!session) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		// Ownership: job → account → user. Verify before accepting the socket.
		void (async () => {
			try {
				const jobRow = (
					await db.select().from(jobTable).where(eq(jobTable.id, jobId))
				)[0];
				const acct = jobRow
					? (
							await db
								.select()
								.from(account)
								.where(eq(account.id, jobRow.accountId))
						)[0]
					: null;
				if (!jobRow || !acct || acct.userId !== session.userId) {
					socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
					socket.destroy();
					return;
				}
				wss.handleUpgrade(req, socket, head, (ws) =>
					subscribe(ctx, ws, jobId),
				);
			} catch {
				socket.destroy();
			}
		})();
	});
};

const subscribe = (ctx: AppContext, ws: WebSocket, jobId: number): void => {
	const idStr = String(jobId);
	const send = (event: unknown) => {
		if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
	};

	const snapshot = ctx.hub.snapshot(idStr);
	if (snapshot) send(snapshot);

	const unsubscribe = ctx.hub.subscribe(idStr, (event) => {
		send(event);
		// Terminal status event → close the socket cleanly.
		if (event.step === "status") ws.close(1000, "job finished");
	});

	ws.on("close", unsubscribe);
	ws.on("error", unsubscribe);
};
