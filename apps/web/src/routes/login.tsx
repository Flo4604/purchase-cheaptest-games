import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { QrLogin } from "../components/QrLogin.js";
import { Card } from "../components/ui.js";
import { colors, space } from "../tokens.stylex";

export const Route = createFileRoute("/login")({ component: LoginPage });

const s = stylex.create({
	wrap: {
		minHeight: "70vh",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: space.lg,
	},
	heading: { textAlign: "center", display: "flex", flexDirection: "column", gap: "6px" },
	title: { fontSize: "26px", fontWeight: 800, color: colors.text, letterSpacing: "-0.3px" },
	sub: { fontSize: "14px", color: colors.muted },
	cardWrap: { width: "100%", maxWidth: "360px" },
});

function LoginPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	return (
		<div {...stylex.props(s.wrap)}>
			<div {...stylex.props(s.heading)}>
				<span {...stylex.props(s.title)}>Sign in with Steam</span>
				<span {...stylex.props(s.sub)}>Scan the QR with the Steam mobile app to continue.</span>
			</div>
			<div {...stylex.props(s.cardWrap)}>
				<Card>
					<QrLogin
						title="Sign in"
						onAuthenticated={() => {
							qc.invalidateQueries();
							navigate({ to: "/" });
						}}
					/>
				</Card>
			</div>
		</div>
	);
}
