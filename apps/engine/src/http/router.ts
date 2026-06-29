import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import type { AppContext } from "./context.js";
import * as accounts from "./handlers/accounts.js";
import * as auth from "./handlers/auth.js";
import * as jobs from "./handlers/jobs.js";

// API surface per WEBAPP_PLAN §7.
export const createRouter = (ctx: AppContext) =>
	HttpRouter.empty.pipe(
		HttpRouter.get(
			"/health",
			HttpServerResponse.json({ status: "ok", service: "engine" }).pipe(
				Effect.orDie,
			),
		),
		HttpRouter.post("/auth/register", auth.register(ctx)),
		HttpRouter.post("/auth/login", auth.login(ctx)),
		HttpRouter.post("/auth/logout", auth.logout(ctx)),
		HttpRouter.post("/accounts", accounts.addAccount(ctx)),
		HttpRouter.get("/accounts", accounts.listAccounts(ctx)),
		HttpRouter.post("/accounts/:id/unlock", accounts.unlock(ctx)),
		HttpRouter.post("/accounts/:id/refresh", accounts.refresh(ctx)),
		HttpRouter.post("/accounts/:id/jobs", jobs.startJob(ctx)),
		HttpRouter.get("/accounts/:id/jobs", jobs.listJobs(ctx)),
		HttpRouter.get("/jobs/:id", jobs.getJob(ctx)),
		HttpRouter.post("/jobs/:id/cancel", jobs.cancelJob(ctx)),
		// GET /jobs/:id/stream is a WebSocket upgrade handled in http/ws.ts.
	);
