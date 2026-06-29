import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../lib/api.js";
import { useJobStream } from "../lib/useJobStream.js";
import { Button, Card } from "../components/ui.js";
import { colors, font, radius, space } from "../tokens.stylex";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobView });

const s = stylex.create({
	head: { display: "flex", alignItems: "center", justifyContent: "space-between" },
	title: { fontSize: "18px", fontWeight: 700, color: colors.text, fontFamily: font.mono },
	back: { color: colors.accent, textDecoration: "none", fontSize: "13px" },
	statusRow: { display: "flex", gap: space.md, alignItems: "center", fontSize: "13px", color: colors.muted },
	track: { height: "8px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: radius.pill, overflow: "hidden" },
	fill: { height: "100%", background: colors.accent, transition: "width 150ms" },
	log: {
		fontFamily: font.mono,
		fontSize: "12px",
		background: colors.bg,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: space.md,
		height: "320px",
		overflowY: "auto",
		display: "flex",
		flexDirection: "column",
		gap: "2px",
	},
	line: (c: string) => ({ color: c, whiteSpace: "pre-wrap" }),
	dot: (c: string) => ({ color: c }),
});

const levelColor: Record<string, string> = {
	info: "#9aa3ad",
	warn: "#fbbf24",
	error: "#ff6b6b",
};
const statusColor: Record<string, string> = {
	queued: "#9aa3ad",
	running: "#5b8cff",
	done: "#4ade80",
	failed: "#ff6b6b",
	canceled: "#fbbf24",
};

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

	const status = stream.terminal ?? job.data?.status ?? "…";
	const active = status === "queued" || status === "running";
	const bar = [...stream.events].reverse().find((e) => e.total > 0);
	const pct = bar ? Math.min(100, Math.round((bar.current / bar.total) * 100)) : 0;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			<div {...stylex.props(s.head)}>
				<span {...stylex.props(s.title)}>
					job #{id} · {job.data?.type ?? ""}
				</span>
				<Link to="/" {...stylex.props(s.back)}>← back</Link>
			</div>

			<Card>
				<div {...stylex.props(s.statusRow)}>
					<span {...stylex.props(s.dot(statusColor[status] ?? colors.muted))}>●</span>
					<span style={{ color: statusColor[status] ?? colors.muted, fontWeight: 600 }}>{status}</span>
					<span>{stream.connected ? "● live" : "○ disconnected"}</span>
					{bar && <span>{bar.current}/{bar.total}</span>}
					<span style={{ marginLeft: "auto" }}>
						<Button variant="danger" disabled={!active || cancel.isPending} onClick={() => cancel.mutate()}>
							Cancel
						</Button>
					</span>
				</div>
				{bar && (
					<div {...stylex.props(s.track)}>
						<div {...stylex.props(s.fill)} style={{ width: `${pct}%` }} />
					</div>
				)}
				<div {...stylex.props(s.log)}>
					{stream.events.length === 0 && (
						<span {...stylex.props(s.line(colors.muted))}>Waiting for progress…</span>
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
