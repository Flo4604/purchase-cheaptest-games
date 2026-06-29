import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../lib/api.js";
import { useJobStream } from "../lib/useJobStream.js";
import { Badge, Button, Card, ProgressBar, type Tone } from "../components/ui.js";
import { colors, font, radius, space } from "../tokens.stylex";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobView });

const s = stylex.create({
	top: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space.lg },
	title: { fontSize: "20px", fontWeight: 800, color: colors.text, fontFamily: font.mono, letterSpacing: "-0.2px" },
	back: { color: colors.muted, textDecoration: "none", fontSize: "13px" },
	statusRow: { display: "flex", alignItems: "center", gap: space.md },
	live: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: colors.muted },
	dot: { width: "7px", height: "7px", borderRadius: "50%" },
	count: { fontSize: "12px", color: colors.muted, fontFamily: font.mono, marginLeft: "auto" },
	log: {
		fontFamily: font.mono,
		fontSize: "12px",
		lineHeight: 1.6,
		background: colors.bg,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: space.md,
		height: "380px",
		overflowY: "auto",
		display: "flex",
		flexDirection: "column",
	},
	line: (c: string) => ({ color: c, whiteSpace: "pre-wrap", wordBreak: "break-word" }),
});

const levelColor: Record<string, string> = { info: "#aeb6c2", warn: "#f5b945", error: "#ff6a6a" };
const statusTone: Record<string, Tone> = { queued: "neutral", running: "accent", done: "success", failed: "danger", canceled: "warn" };
const statusDot: Record<string, string> = { queued: "#8b95a3", running: "#4ea1ff", done: "#45d483", failed: "#ff6a6a", canceled: "#f5b945" };

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

			<Card>
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

				{bar && <ProgressBar value={bar.current} total={bar.total} />}

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
			</Card>
		</div>
	);
}
