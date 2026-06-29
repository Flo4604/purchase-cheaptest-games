import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Account, api } from "../lib/api.js";
import { useJobStream } from "../lib/useJobStream.js";
import { colors, font, radius, space } from "../tokens.stylex";
import { JobLauncher } from "./JobLauncher.js";
import { Modal } from "./Modal.js";
import { Badge, Button, Card, Spinner, Stat, type Tone } from "./ui.js";

const s = stylex.create({
	head: { display: "flex", alignItems: "center", gap: space.md },
	avatar: {
		width: "40px",
		height: "40px",
		flexShrink: 0,
		borderRadius: radius.md,
		background: `linear-gradient(135deg, ${colors.accent}, #2d6fd6)`,
		color: colors.onAccent,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontWeight: 800,
		fontSize: "18px",
	},
	idCol: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
	name: { fontSize: "16px", fontWeight: 700, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
	steamId: { fontSize: "11px", color: colors.faint, fontFamily: font.mono },
	stats: { display: "flex", gap: space.xl, alignItems: "center" },
	statSide: { marginLeft: "auto" },
	pills: { display: "flex", gap: "6px", flexWrap: "wrap" },
	divider: { height: "1px", background: colors.border, margin: `${space.xs} 0` },
	jobs: { display: "flex", flexDirection: "column", gap: "6px" },
	jobsLabel: { fontSize: "10px", fontWeight: 600, color: colors.faint, textTransform: "uppercase", letterSpacing: "0.6px" },
	jobLine: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "13px", fontFamily: font.mono },
	jobLink: { color: colors.text, textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

const jobTone: Record<string, Tone> = {
	queued: "neutral",
	running: "accent",
	done: "success",
	failed: "danger",
	canceled: "warn",
};

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
		<Card hover>
			<div {...stylex.props(s.head)}>
				<div {...stylex.props(s.avatar)}>{account.username.charAt(0).toUpperCase()}</div>
				<div {...stylex.props(s.idCol)}>
					<span {...stylex.props(s.name)}>{account.username}</span>
					<span {...stylex.props(s.steamId)}>{account.steamId}</span>
				</div>
			</div>

			<div {...stylex.props(s.stats)}>
				<Stat
					value={
						account.cachedWalletBalance != null
							? `${account.cachedWalletBalance} ${account.cachedWalletCurrency ?? ""}`
							: "—"
					}
					label="wallet"
				/>
				<Stat value={account.cachedOwnedCount ?? "—"} label="games" />
				<span {...stylex.props(s.statSide)}>
					<Button size="sm" onClick={() => refresh.mutate()} disabled={refreshing || refresh.isPending}>
						{refreshing ? <Spinner /> : "Refresh"}
					</Button>
				</span>
			</div>

			<div {...stylex.props(s.pills)}>
				<Badge>{account.usage}</Badge>
				<Badge>limit {account.limit === "0" ? "∞" : account.limit}</Badge>
				<Badge>max {account.maxPrice || "∞"}</Badge>
			</div>

			<Button variant="primary" onClick={() => setLaunching(true)}>
				Run a flow
			</Button>

			{jobs.data && jobs.data.length > 0 && (
				<>
					<div {...stylex.props(s.divider)} />
					<div {...stylex.props(s.jobs)}>
						<span {...stylex.props(s.jobsLabel)}>Recent jobs</span>
						{jobs.data.slice(0, 4).map((j) => (
							<div key={j.id} {...stylex.props(s.jobLine)}>
								<Link to="/jobs/$jobId" params={{ jobId: String(j.id) }} {...stylex.props(s.jobLink)}>
									#{j.id} · {j.type}
								</Link>
								<Badge tone={jobTone[j.status] ?? "neutral"}>{j.status}</Badge>
							</div>
						))}
					</div>
				</>
			)}

			<Modal open={launching} onClose={() => setLaunching(false)} title={`Run a flow · ${account.username}`}>
				<JobLauncher account={account} onLaunched={() => setLaunching(false)} />
			</Modal>
		</Card>
	);
}
