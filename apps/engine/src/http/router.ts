import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import type { AppContext } from "./context.js";
import * as accounts from "./handlers/accounts.js";
import * as auth from "./handlers/auth.js";
import * as jobs from "./handlers/jobs.js";

// API surface. Auth is Steam QR only (no email/password).
export const createRouter = (ctx: AppContext) =>
	HttpRouter.empty.pipe(
		HttpRouter.get(
			"/health",
			HttpServerResponse.json({ status: "ok", service: "engine" }).pipe(
				Effect.orDie,
			),
		),
		// Steam QR login (and add-account when already signed in)
		HttpRouter.post("/auth/qr/start", auth.qrStart(ctx)),
		HttpRouter.get("/auth/qr/:qrId", auth.qrStatus(ctx)),
		HttpRouter.post("/auth/logout", auth.logout(ctx)),
		// Accounts
		HttpRouter.get("/accounts", accounts.listAccounts(ctx)),
		HttpRouter.post("/accounts/:id/refresh", accounts.refresh(ctx)),
		// Jobs
		HttpRouter.post("/accounts/:id/jobs", jobs.startJob(ctx)),
		HttpRouter.get("/accounts/:id/jobs", jobs.listJobs(ctx)),
		HttpRouter.get("/jobs/:id", jobs.getJob(ctx)),
		HttpRouter.post("/jobs/:id/cancel", jobs.cancelJob(ctx)),
		// GET /jobs/:id/stream is a WebSocket upgrade handled in http/ws.ts.
	);
