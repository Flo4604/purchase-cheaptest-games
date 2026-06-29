import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { JobType, type ProgressEvent } from "@psg/core";
import { account, db } from "@psg/db";
import { eq } from "drizzle-orm";
import { Effect, Either, Schema, Stream } from "effect";
import type { AppContext } from "../context.js";
import { badRequest, jsonResponse, notFound, unauthorized } from "../respond.js";
import { getSession } from "../session.js";

const StartBody = Schema.Struct({
	type: JobType,
	params: Schema.optional(Schema.Unknown),
});

// Load an account only if it belongs to the user; null otherwise.
const ownedAccount = (userId: number, accountId: number) =>
	Effect.promise(() =>
		db
			.select()
			.from(account)
			.where(eq(account.id, accountId))
			.then((rows) => rows[0] ?? null),
	).pipe(Effect.map((a) => (a && a.userId === userId ? a : null)));

export const startJob = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const params = yield* HttpRouter.params;
		const accountId = Number(params.id);
		if (!Number.isInteger(accountId)) return yield* badRequest("invalid account id");
		const acct = yield* ownedAccount(session.userId, accountId);
		if (!acct) return yield* notFound("account not found");

		const parsed = yield* Effect.either(
			HttpServerRequest.schemaBodyJson(StartBody),
		);
		if (Either.isLeft(parsed)) return yield* badRequest();
		const { type, params: jobParams } = parsed.right;

		const result = yield* Effect.either(
			Effect.tryPromise(() =>
				ctx.jobs.start(
					accountId,
					session.sessionId,
					type,
					(jobParams ?? {}) as Record<string, unknown>,
				),
			),
		);
		if (Either.isLeft(result))
			return yield* jsonResponse(
				{ error: String((result.left as Error)?.message ?? result.left) },
				423,
			);
		return yield* jsonResponse({ jobId: result.right }, 202);
	});

export const listJobs = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const params = yield* HttpRouter.params;
		const accountId = Number(params.id);
		const acct = yield* ownedAccount(session.userId, accountId);
		if (!acct) return yield* notFound("account not found");
		const rows = yield* Effect.promise(() => ctx.jobs.listForAccount(accountId));
		return yield* jsonResponse(rows);
	});

export const getJob = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const params = yield* HttpRouter.params;
		const jobRow = yield* Effect.promise(() => ctx.jobs.get(Number(params.id)));
		if (!jobRow) return yield* notFound("job not found");
		const acct = yield* ownedAccount(session.userId, jobRow.accountId);
		if (!acct) return yield* notFound("job not found");
		return yield* jsonResponse(jobRow);
	});

export const cancelJob = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const params = yield* HttpRouter.params;
		const jobId = Number(params.id);
		const jobRow = yield* Effect.promise(() => ctx.jobs.get(jobId));
		if (!jobRow) return yield* notFound("job not found");
		const acct = yield* ownedAccount(session.userId, jobRow.accountId);
		if (!acct) return yield* notFound("job not found");
		const ok = yield* Effect.promise(() => ctx.jobs.cancel(jobId));
		return yield* jsonResponse({ canceled: ok });
	});

export const streamJob = (ctx: AppContext) =>
	Effect.gen(function* () {
		const session = yield* getSession(ctx);
		if (!session) return yield* unauthorized();
		const params = yield* HttpRouter.params;
		const jobId = Number(params.id);
		const jobRow = yield* Effect.promise(() => ctx.jobs.get(jobId));
		if (!jobRow) return yield* notFound("job not found");
		const acct = yield* ownedAccount(session.userId, jobRow.accountId);
		if (!acct) return yield* notFound("job not found");

		const idStr = String(jobId);
		const enc = new TextEncoder();
		// Server-Sent Events: one-way progress stream (simpler than WS, sufficient
		// for live job progress). Closes when a terminal "status" event arrives.
		const sse = Stream.asyncEffect<Uint8Array>((emit) => {
			const send = (e: ProgressEvent) => {
				void emit.single(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
			};
			const snap = ctx.hub.snapshot(idStr);
			if (snap) send(snap);
			const unsubscribe = ctx.hub.subscribe(idStr, (e) => {
				send(e);
				if (e.step === "status") void emit.end();
			});
			return Effect.sync(() => unsubscribe());
		});
		return HttpServerResponse.stream(sse, { contentType: "text/event-stream" });
	});
