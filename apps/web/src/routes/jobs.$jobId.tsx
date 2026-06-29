import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, ProgressBar, type Tone } from "../components/ui.js";
import { api } from "../lib/api.js";
import { useJobStream } from "../lib/useJobStream.js";
import { colors, font, space } from "../tokens.stylex";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobView });

const s = stylex.create({
	top: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: space.lg },
	title: { fontSize: "32px", fontWeight: 800, color: colors.text, fontFamily: font.mono, letterSpacing: "-1px" },
	back: { color: { default: colors.muted, ":hover": colors.text }, textDecoration: "none", fontSize: "13px" },
	statusRow: { display: "flex", alignItems: "center", gap: space.md, paddingTop: space.md, borderTop: `1px solid ${colors.hair}` },
	live: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: colors.muted, fontFamily: font.mono },
	dot: { width: "7px", height: "7px", borderRadius: "50%" },
	count: { fontSize: "12px", color: colors.faint, fontFamily: font.mono, marginLeft: "auto" },
	bar: { margin: `${space.md} 0` },
	log: {
		fontFamily: font.mono,
		fontSize: "12.5px",
		lineHeight: 1.7,
		paddingTop: space.md,
		borderTop: `1px solid ${colors.hair}`,
		minHeight: "360px",
		display: "flex",
		flexDirection: "column",
	},
	line: (c: string) => ({ color: c, whiteSpace: "pre-wrap", wordBreak: "break-word" }),
});

const levelColor: Record<string, string> = { info: "#b9b9be", warn: "#f5c518", error: "#ff5a52" };
const statusTone: Record<string, Tone> = { queued: "neutral", running: "accent", done: "success", failed: "danger", canceled: "warn" };
const statusDot: Record<string, string> = { queued: "#5a5a60", running: "#c7f24b", done: "#8fdc9b", failed: "#ff5a52", canceled: "#f5c518" };

function JobView() {
	const { jobId } = Route.useParams();
	const id = Number(jobId);
	const qc = useQueryClient();
	const job = useQuery({ queryKey: ["job", id], queryFn: () => api.getJob(id) });
	const stream = useJobStream(id);

	const cancel = useMutation({
		mutationFn: () => api.cancelJob(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["job", id] }),
	});

	const status = stream.terminal ?? job.data?.status ?? "queued";
	const active = status === "queued" || status === "running";
	const bar = [...stream.events].reverse().find((e) => e.total > 0);

	return (
		<div>
			<div {...stylex.props(s.top)}>
				<span {...stylex.props(s.title)}>
					job #{id}{job.data ? ` · ${job.data.type}` : ""}
				</span>
				<Link to="/" {...stylex.props(s.back)}>← dashboard</Link>
			</div>

			<div {...stylex.props(s.statusRow)}>
				<Badge tone={statusTone[status] ?? "neutral"}>{status}</Badge>
				<span {...stylex.props(s.live)}>
					<span {...stylex.props(s.dot)} style={{ background: stream.connected ? statusDot.running : colors.faint }} />
					{stream.connected ? "live" : "disconnected"}
				</span>
				{bar && <span {...stylex.props(s.count)}>{bar.current}/{bar.total}</span>}
				<Button variant="danger" size="sm" disabled={!active || cancel.isPending} onClick={() => cancel.mutate()}>
					Cancel
				</Button>
			</div>

			{bar && (
				<div {...stylex.props(s.bar)}>
					<ProgressBar value={bar.current} total={bar.total} />
				</div>
			)}

			<div {...stylex.props(s.log)}>
				{stream.events.length === 0 && (
					<span {...stylex.props(s.line(colors.faint))}>Waiting for progress…</span>
				)}
				{stream.events
					.filter((e) => e.step !== "status")
					.map((e, i) => (
						<span key={i} {...stylex.props(s.line(levelColor[e.level] ?? colors.text))}>
							{e.message}
						</span>
					))}
			</div>
		</div>
	);
}
