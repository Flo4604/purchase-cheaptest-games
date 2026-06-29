import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountCard } from "../components/AccountCard.js";
import { Modal } from "../components/Modal.js";
import { QrLogin } from "../components/QrLogin.js";
import { Button } from "../components/ui.js";
import { ApiError, api } from "../lib/api.js";
import { colors, space } from "../tokens.stylex";

export const Route = createFileRoute("/")({ component: Dashboard });

const s = stylex.create({
	head: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: space.xl },
	title: { fontSize: "40px", fontWeight: 800, color: colors.text, letterSpacing: "-1.4px", lineHeight: 1 },
	actions: { display: "flex", gap: space.sm, alignItems: "center" },
	list: { display: "flex", flexDirection: "column" },
	empty: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: space.md, paddingTop: space.xl, color: colors.muted, borderTop: `1px solid ${colors.hair}` },
	emptyTitle: { fontSize: "22px", fontWeight: 700, color: colors.text, letterSpacing: "-0.5px" },
	muted: { color: colors.muted },
	link: { color: colors.accent, textDecoration: "none" },
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
						+ Connect
					</Button>
					<Button variant="ghost" onClick={() => logout.mutate()}>
						Log out
					</Button>
				</div>
			</div>

			{accounts.data.length === 0 ? (
				<div {...stylex.props(s.empty)}>
					<span {...stylex.props(s.emptyTitle)}>No accounts connected</span>
					<span>Scan a Steam QR to connect your first account.</span>
					<Button variant="primary" onClick={() => setConnecting(true)}>
						+ Connect account
					</Button>
				</div>
			) : (
				<div {...stylex.props(s.list)}>
					{accounts.data.map((acct) => (
						<AccountCard key={acct.id} account={acct} />
					))}
				</div>
			)}

			{connectModal}
		</div>
	);
}
