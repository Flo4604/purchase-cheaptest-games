import { createServer } from "node:http";
import {
	HttpMiddleware,
	HttpRouter,
	HttpServer,
	HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";

const PORT = Number(process.env.PORT ?? 3101);

// HTTP surface. Routes for auth/accounts/jobs (WEBAPP_PLAN §7) land in Phase 4.
const router = HttpRouter.empty.pipe(
	HttpRouter.get(
		"/health",
		HttpServerResponse.json({ status: "ok", service: "engine" }),
	),
);

const HttpLive = HttpServer.serve(router.pipe(HttpMiddleware.logger)).pipe(
	HttpServer.withLogAddress,
	Layer.provide(NodeHttpServer.layer(createServer, { port: PORT })),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
