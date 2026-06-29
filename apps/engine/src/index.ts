import { createServer } from "node:http";
import { HttpMiddleware, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { runMigrations } from "@psg/db";
import { Layer } from "effect";
import { createAppContext } from "./http/context.js";
import { createRouter } from "./http/router.js";
import { attachWebSocket } from "./http/ws.js";

// Safety net: steam-user can throw from internal async ticks (e.g. malformed
// server payloads). A single job must never crash the shared engine process.
process.on("unhandledRejection", (reason) => {
	console.error("[engine] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
	console.error("[engine] uncaughtException:", err);
});

const PORT = Number(process.env.PORT ?? 3101);
const WS_PORT = Number(process.env.WS_PORT ?? 3102);
const CONCURRENCY = Number(process.env.JOB_CONCURRENCY ?? 4);

// Process-wide singletons (job queue, KEK store, sessions) + the API router.
// Apply pending migrations on boot (pglite in dev, real Postgres in prod) so
// `pnpm dev` needs no separate DB setup step.
await runMigrations();

const ctx = createAppContext(CONCURRENCY);
const router = createRouter(ctx);

// Live job progress over WebSocket on a dedicated server/port, so it doesn't
// contend with @effect/platform's own HTTP upgrade handling. Same-host cookies
// are still sent (cookies aren't port-scoped), so session auth works.
const wsServer = createServer();
attachWebSocket(wsServer, ctx);
wsServer.listen(WS_PORT, () =>
	console.log(`[engine] websocket listening on :${WS_PORT}`),
);

const HttpLive = HttpServer.serve(router.pipe(HttpMiddleware.logger)).pipe(
	HttpServer.withLogAddress,
	Layer.provide(NodeHttpServer.layer(createServer, { port: PORT })),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
