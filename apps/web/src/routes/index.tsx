import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountCard } from "../components/AccountCard.js";
import { Modal } from "../components/Modal.js";
import { QrLogin } from "../components/QrLogin.js";
import { Button, Card } from "../components/ui.js";
import { ApiError, api } from "../lib/api.js";
import { colors, space } from "../tokens.stylex";

export const Route = createFileRoute("/")({ component: Dashboard });

const s = stylex.create({
	head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: space.xl },
	title: { fontSize: "24px", fontWeight: 800, color: colors.text, letterSpacing: "-0.3px" },
	actions: { display: "flex", gap: space.sm },
	grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: space.lg },
	empty: { display: "flex", flexDirection: "column", alignItems: "center", gap: space.md, textAlign: "center", padding: `${space.xl} ${space.lg}`, color: colors.muted },
	emptyTitle: { fontSize: "16px", fontWeight: 700, color: colors.text },
	muted: { color: colors.muted },
	link: { color: colors.accent },
});

function Dashboard() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [connecting, setConnecting] = useState(false);
	const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });

	const unauthorized = accounts.error instanceof ApiError && accounts.error.status === 401;
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

	const connectModal = (
		<Modal open={connecting} onClose={() => setConnecting(false)} title="Connect a Steam account">
			<QrLogin
				title="Connect"
				onAuthenticated={() => {
					setConnecting(false);
					qc.invalidateQueries({ queryKey: ["accounts"] });
				}}
			/>
		</Modal>
	);

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
					<Button variant="primary" onClick={() => setConnecting(true)}>
						+ Connect account
					</Button>
					<Button variant="ghost" onClick={() => logout.mutate()}>
						Log out
					</Button>
				</div>
			</div>

			{accounts.data.length === 0 ? (
				<Card>
					<div {...stylex.props(s.empty)}>
						<span {...stylex.props(s.emptyTitle)}>No accounts connected</span>
						<span>Connect a Steam account by scanning a QR code.</span>
						<Button variant="primary" onClick={() => setConnecting(true)}>
							+ Connect account
						</Button>
					</div>
				</Card>
			) : (
				<div {...stylex.props(s.grid)}>
					{accounts.data.map((acct) => (
						<AccountCard key={acct.id} account={acct} />
					))}
				</div>
			)}

			{connectModal}
		</div>
	);
}
