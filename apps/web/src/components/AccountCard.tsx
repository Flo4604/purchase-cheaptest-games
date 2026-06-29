import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type Account, api, type JobType } from "../lib/api.js";
import { colors, font, radius, space } from "../tokens.stylex";
import { Button, Card } from "./ui.js";

const JOB_TYPES: JobType[] = ["buy", "sell", "cleanup", "gems", "redeem", "activate"];

const s = stylex.create({
	head: { display: "flex", alignItems: "center", justifyContent: "space-between" },
	name: { fontSize: "16px", fontWeight: 700, color: colors.text },
	meta: { display: "flex", gap: space.md, flexWrap: "wrap", fontSize: "13px", color: colors.muted, fontFamily: font.mono },
	num: { color: colors.text },
	row: { display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap" },
	select: {
		background: colors.bg,
		color: colors.text,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: `${space.sm} ${space.md}`,
		fontSize: "14px",
	},
	input: {
		background: colors.bg,
		color: colors.text,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: `${space.sm} ${space.md}`,
		fontSize: "14px",
	},
	jobLine: { display: "flex", gap: space.sm, alignItems: "center", fontSize: "13px", fontFamily: font.mono },
	jobLink: { color: colors.accent, textDecoration: "none" },
	error: { color: colors.danger, fontSize: "13px" },
	ok: { color: colors.success, fontSize: "13px" },
	statusDot: (c: string) => ({ color: c }),
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
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [type, setType] = useState<JobType>("buy");

	const jobs = useQuery({
		queryKey: ["jobs", account.id],
		queryFn: () => api.listJobs(account.id),
	});

	const unlock = useMutation({
		mutationFn: () => api.unlock(account.id, password),
		onSuccess: () => setPassword(""),
	});

	const run = useMutation({
		mutationFn: () => {
			const config =
				type === "buy"
					? {
							usage: account.usage,
							limit: account.limit,
							maxPrice: account.maxPrice,
							priceOptionsFlag: account.priceOptionsFlag,
						}
					: type === "cleanup"
						? { removeAll: false }
						: {};
			return api.startJob(account.id, type, { config });
		},
		onSuccess: ({ jobId }) => {
			qc.invalidateQueries({ queryKey: ["jobs", account.id] });
			navigate({ to: "/jobs/$jobId", params: { jobId: String(jobId) } });
		},
	});

	return (
		<Card>
			<div {...stylex.props(s.head)}>
				<span {...stylex.props(s.name)}>{account.username}</span>
				<span {...stylex.props(s.meta)}>{account.hasSealedToken ? "🔒 token sealed" : "no token"}</span>
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

			{/* Flow launcher */}
			<div {...stylex.props(s.row)}>
				<select
					{...stylex.props(s.select)}
					value={type}
					onChange={(e) => setType(e.target.value as JobType)}
				>
					{JOB_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
				<Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
					{run.isPending ? "Starting…" : "Run"}
				</Button>
				{run.isError && <span {...stylex.props(s.error)}>{(run.error as Error).message}</span>}
			</div>

			{/* Recent jobs */}
			{jobs.data && jobs.data.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{jobs.data.slice(0, 5).map((j) => (
						<div key={j.id} {...stylex.props(s.jobLine)}>
							<span {...stylex.props(s.statusDot(statusColor[j.status] ?? colors.muted))}>●</span>
							<Link
								to="/jobs/$jobId"
								params={{ jobId: String(j.id) }}
								{...stylex.props(s.jobLink)}
							>
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
