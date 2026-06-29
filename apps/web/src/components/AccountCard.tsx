import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Account, api } from "../lib/api.js";
import { useJobStream } from "../lib/useJobStream.js";
import { colors, font, radius, space } from "../tokens.stylex";
import { Button, Card } from "./ui.js";
import { JobLauncher } from "./JobLauncher.js";

const s = stylex.create({
	head: { display: "flex", alignItems: "center", justifyContent: "space-between" },
	name: { fontSize: "16px", fontWeight: 700, color: colors.text },
	sealed: { fontSize: "12px", color: colors.muted },
	stats: { display: "flex", gap: space.lg, alignItems: "baseline" },
	stat: { display: "flex", flexDirection: "column" },
	statNum: { fontSize: "18px", fontWeight: 700, color: colors.text, fontFamily: font.mono },
	statLabel: { fontSize: "11px", color: colors.muted, textTransform: "uppercase", letterSpacing: "0.5px" },
	statSide: { marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: space.xs },
	when: { fontSize: "11px", color: colors.muted },
	meta: { display: "flex", gap: space.md, flexWrap: "wrap", fontSize: "13px", color: colors.muted, fontFamily: font.mono },
	num: { color: colors.text },
	row: { display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap" },
	input: { background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${space.sm} ${space.md}`, fontSize: "14px" },
	jobLine: { display: "flex", gap: space.sm, alignItems: "center", fontSize: "13px", fontFamily: font.mono },
	jobLink: { color: colors.accent, textDecoration: "none" },
	error: { color: colors.danger, fontSize: "13px" },
	ok: { color: colors.success, fontSize: "13px" },
	dot: (c: string) => ({ color: c }),
});

const statusColor: Record<string, string> = {
	queued: "#9aa3ad",
	running: "#5b8cff",
	done: "#4ade80",
	failed: "#ff6b6b",
	canceled: "#fbbf24",
};

export function AccountCard({ account }: { account: Account }) {
	const qc = useQueryClient();
	const [password, setPassword] = useState("");
	const [refreshJobId, setRefreshJobId] = useState<number | null>(null);

	const jobs = useQuery({
		queryKey: ["jobs", account.id],
		queryFn: () => api.listJobs(account.id),
	});

	const unlock = useMutation({
		mutationFn: () => api.unlock(account.id, password),
		onSuccess: () => setPassword(""),
	});

	// Refresh wallet/owned-count in place: start the refresh job, watch its WS
	// stream, and pull the updated cached values when it finishes.
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
		<Card>
			<div {...stylex.props(s.head)}>
				<span {...stylex.props(s.name)}>{account.username}</span>
				<span {...stylex.props(s.sealed)}>{account.hasSealedToken ? "🔒 sealed" : "no token"}</span>
			</div>

			{/* Cached wallet + owned-game count */}
			<div {...stylex.props(s.stats)}>
				<div {...stylex.props(s.stat)}>
					<span {...stylex.props(s.statNum)}>
						{account.cachedWalletBalance != null
							? `${account.cachedWalletBalance} ${account.cachedWalletCurrency ?? ""}`
							: "—"}
					</span>
					<span {...stylex.props(s.statLabel)}>wallet</span>
				</div>
				<div {...stylex.props(s.stat)}>
					<span {...stylex.props(s.statNum)}>{account.cachedOwnedCount ?? "—"}</span>
					<span {...stylex.props(s.statLabel)}>games</span>
				</div>
				<div {...stylex.props(s.statSide)}>
					<Button onClick={() => refresh.mutate()} disabled={refreshing || refresh.isPending}>
						{refreshing ? "Refreshing…" : "Refresh"}
					</Button>
					{account.cachedAt && (
						<span {...stylex.props(s.when)}>
							{new Date(account.cachedAt).toLocaleString()}
						</span>
					)}
				</div>
			</div>

			<div {...stylex.props(s.meta)}>
				<span>usage <span {...stylex.props(s.num)}>{account.usage}</span></span>
				<span>limit <span {...stylex.props(s.num)}>{account.limit === "0" ? "∞" : account.limit}</span></span>
				<span>maxPrice <span {...stylex.props(s.num)}>{account.maxPrice || "∞"}</span></span>
			</div>

			{/* Unlock: re-derive the KEK for this session if it expired */}
			<div {...stylex.props(s.row)}>
				<input
					{...stylex.props(s.input)}
					type="password"
					placeholder="password to unlock"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<Button onClick={() => unlock.mutate()} disabled={unlock.isPending || !password}>
					Unlock
				</Button>
				{unlock.isSuccess && <span {...stylex.props(s.ok)}>unlocked</span>}
				{unlock.isError && <span {...stylex.props(s.error)}>{(unlock.error as Error).message}</span>}
			</div>

			<JobLauncher account={account} />

			{jobs.data && jobs.data.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{jobs.data.slice(0, 5).map((j) => (
						<div key={j.id} {...stylex.props(s.jobLine)}>
							<span {...stylex.props(s.dot(statusColor[j.status] ?? colors.muted))}>●</span>
							<Link to="/jobs/$jobId" params={{ jobId: String(j.id) }} {...stylex.props(s.jobLink)}>
								#{j.id} {j.type}
							</Link>
							<span style={{ color: "#9aa3ad" }}>{j.status}</span>
						</div>
					))}
				</div>
			)}
		</Card>
	);
}
