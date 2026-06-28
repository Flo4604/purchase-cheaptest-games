import { Schema } from "effect";

// Shared domain vocabulary for jobs + progress streaming (see WEBAPP_PLAN §5/§6).

export const JobType = Schema.Literal(
	"buy",
	"sell",
	"cleanup",
	"gems",
	"redeem",
	"activate",
);
export type JobType = typeof JobType.Type;

export const JobStatus = Schema.Literal(
	"queued",
	"running",
	"done",
	"failed",
	"canceled",
);
export type JobStatus = typeof JobStatus.Type;

// One progress tick emitted by an engine flow, streamed to the client over WS.
export const ProgressEvent = Schema.Struct({
	step: Schema.String,
	current: Schema.Number,
	total: Schema.Number,
	message: Schema.String,
	level: Schema.Literal("info", "warn", "error"),
});
export type ProgressEvent = typeof ProgressEvent.Type;
