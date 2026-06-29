import { createServer } from "node:http";
import { HttpMiddleware, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { createAppContext } from "./http/context.js";
import { createRouter } from "./http/router.js";

// Safety net: steam-user can throw from internal async ticks (e.g. malformed
// server payloads). A single job must never crash the shared engine process.
process.on("unhandledRejection", (reason) => {
	console.error("[engine] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
	console.error("[engine] uncaughtException:", err);
});

const PORT = Number(process.env.PORT ?? 3101);
const CONCURRENCY = Number(process.env.JOB_CONCURRENCY ?? 4);

// Process-wide singletons (job queue, KEK store, sessions) + the API router.
const ctx = createAppContext(CONCURRENCY);
const router = createRouter(ctx);

const HttpLive = HttpServer.serve(router.pipe(HttpMiddleware.logger)).pipe(
	HttpServer.withLogAddress,
	Layer.provide(NodeHttpServer.layer(createServer, { port: PORT })),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
