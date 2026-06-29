import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountCard } from "../components/AccountCard.js";
import { QrLogin } from "../components/QrLogin.js";
import { Button } from "../components/ui.js";
import { ApiError, api } from "../lib/api.js";
import { colors, space } from "../tokens.stylex";

export const Route = createFileRoute("/")({ component: Dashboard });

const s = stylex.create({
	head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space.lg },
	title: { fontSize: "22px", fontWeight: 700, color: colors.text },
	actions: { display: "flex", gap: space.sm },
	grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: space.md },
	connect: { maxWidth: "320px", marginBottom: space.lg },
	muted: { color: colors.muted },
	link: { color: colors.accent },
});

function Dashboard() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [connecting, setConnecting] = useState(false);
	const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });

	const unauthorized =
		accounts.error instanceof ApiError && accounts.error.status === 401;
	useEffect(() => {
		if (unauthorized) navigate({ to: "/login" });
	}, [unauthorized, navigate]);

	const logout = useMutation({
		mutationFn: api.logout,
		onSuccess: () => {
			qc.clear();
			navigate({ to: "/login" });
		},
	});

	if (accounts.isPending) return <div {...stylex.props(s.muted)}>Loading…</div>;
	if (accounts.error)
		return (
			<div {...stylex.props(s.muted)}>
				Not signed in. <Link to="/login" {...stylex.props(s.link)}>Sign in →</Link>
			</div>
		);

	return (
		<div>
			<div {...stylex.props(s.head)}>
				<span {...stylex.props(s.title)}>Accounts</span>
				<div {...stylex.props(s.actions)}>
					<Button onClick={() => setConnecting((v) => !v)}>
						{connecting ? "Cancel" : "Connect account"}
					</Button>
					<Button onClick={() => logout.mutate()}>Log out</Button>
				</div>
			</div>

			{connecting && (
				<div {...stylex.props(s.connect)}>
					<QrLogin
						title="Connect a Steam account"
						onAuthenticated={() => {
							setConnecting(false);
							qc.invalidateQueries({ queryKey: ["accounts"] });
						}}
					/>
				</div>
			)}

			{accounts.data.length === 0 ? (
				<div {...stylex.props(s.muted)}>
					No accounts yet — click “Connect account” and scan the QR.
				</div>
			) : (
				<div {...stylex.props(s.grid)}>
					{accounts.data.map((acct) => (
						<AccountCard key={acct.id} account={acct} />
					))}
				</div>
			)}
		</div>
	);
}
