import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Account, api } from "../lib/api.js";
import { useJobStream } from "../lib/useJobStream.js";
import { colors, font, space } from "../tokens.stylex";
import { JobLauncher } from "./JobLauncher.js";
import { Modal } from "./Modal.js";
import { Badge, Button, Spinner, Stat, type Tone } from "./ui.js";

const s = stylex.create({
	row: {
		display: "flex",
		flexDirection: "column",
		gap: space.md,
		padding: `${space.lg} 0`,
		borderTop: `1px solid ${colors.hair}`,
	},
	top: { display: "flex", alignItems: "baseline", gap: space.md },
	name: { fontSize: "24px", fontWeight: 800, color: colors.text, letterSpacing: "-0.6px" },
	steamId: { marginLeft: "auto", fontSize: "12px", color: colors.faint, fontFamily: font.mono },
	mid: { display: "flex", alignItems: "center", gap: space.xl },
	actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: space.md },
	runLink: {
		background: "none",
		border: "none",
		cursor: "pointer",
		color: { default: colors.accent, ":hover": "#d7f96e" },
		fontFamily: font.sans,
		fontSize: "14px",
		fontWeight: 700,
		padding: 0,
	},
	config: { fontSize: "13px", color: colors.faint, fontFamily: font.mono },
	configVal: { color: colors.muted },
	jobs: { display: "flex", gap: space.lg, flexWrap: "wrap" },
	jobLine: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "12px", fontFamily: font.mono },
	jobLink: { color: { default: colors.muted, ":hover": colors.text }, textDecoration: "none" },
});

const jobTone: Record<string, Tone> = { queued: "neutral", running: "accent", done: "success", failed: "danger", canceled: "warn" };

export function AccountCard({ account }: { account: Account }) {
	const qc = useQueryClient();
	const [launching, setLaunching] = useState(false);
	const [refreshJobId, setRefreshJobId] = useState<number | null>(null);

	const jobs = useQuery({
		queryKey: ["jobs", account.id],
		queryFn: () => api.listJobs(account.id),
	});

	const refresh = useMutation({
		mutationFn: () => api.refreshAccount(account.id),
		onSuccess: ({ jobId }) => setRefreshJobId(jobId),
	});
	const refreshStream = useJobStream(refreshJobId);
	useEffect(() => {
		if (refreshStream.terminal) {
			qc.invalidateQueries({ queryKey: ["accounts"] });
			setRefreshJobId(null);
		}
	}, [refreshStream.terminal, qc]);
	const refreshing = refreshJobId !== null;

	return (
		<div {...stylex.props(s.row)}>
			<div {...stylex.props(s.top)}>
				<span {...stylex.props(s.name)}>{account.username}</span>
				<span {...stylex.props(s.steamId)}>{account.steamId}</span>
			</div>

			<div {...stylex.props(s.mid)}>
				<Stat
					value={
						account.cachedWalletBalance != null
							? `${account.cachedWalletBalance} ${account.cachedWalletCurrency ?? ""}`
							: "—"
					}
					label="wallet"
				/>
				<Stat value={account.cachedOwnedCount ?? "—"} label="games" />
				<div {...stylex.props(s.actions)}>
					<button type="button" {...stylex.props(s.runLink)} onClick={() => setLaunching(true)}>
						Run a flow →
					</button>
					<Button variant="ghost" size="sm" onClick={() => refresh.mutate()} disabled={refreshing || refresh.isPending}>
						{refreshing ? <Spinner /> : "Refresh"}
					</Button>
				</div>
			</div>

			<div {...stylex.props(s.config)}>
				usage <span {...stylex.props(s.configVal)}>{account.usage}</span> · limit{" "}
				<span {...stylex.props(s.configVal)}>{account.limit === "0" ? "∞" : account.limit}</span> · max{" "}
				<span {...stylex.props(s.configVal)}>{account.maxPrice || "∞"}</span>
			</div>

			{jobs.data && jobs.data.length > 0 && (
				<div {...stylex.props(s.jobs)}>
					{jobs.data.slice(0, 5).map((j) => (
						<span key={j.id} {...stylex.props(s.jobLine)}>
							<Link to="/jobs/$jobId" params={{ jobId: String(j.id) }} {...stylex.props(s.jobLink)}>
								#{j.id} {j.type}
							</Link>
							<Badge tone={jobTone[j.status] ?? "neutral"}>{j.status}</Badge>
						</span>
					))}
				</div>
			)}

			<Modal open={launching} onClose={() => setLaunching(false)} title={`Run a flow · ${account.username}`}>
				<JobLauncher account={account} onLaunched={() => setLaunching(false)} />
			</Modal>
		</div>
	);
}
