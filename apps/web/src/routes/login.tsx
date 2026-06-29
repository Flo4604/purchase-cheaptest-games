import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { QrLogin } from "../components/QrLogin.js";
import { colors, space } from "../tokens.stylex";

export const Route = createFileRoute("/login")({ component: LoginPage });

const s = stylex.create({
	wrap: {
		minHeight: "62vh",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		textAlign: "center",
		gap: space.xl,
	},
	heading: { display: "flex", flexDirection: "column", gap: space.sm, maxWidth: "440px" },
	title: { fontSize: "44px", fontWeight: 800, color: colors.text, letterSpacing: "-1.2px", lineHeight: 1.05 },
	sub: { fontSize: "16px", color: colors.muted, lineHeight: 1.5 },
});

function LoginPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	return (
		<div {...stylex.props(s.wrap)}>
			<div {...stylex.props(s.heading)}>
				<span {...stylex.props(s.title)}>Sign in with Steam</span>
				<span {...stylex.props(s.sub)}>
					Scan the QR with the Steam mobile app to connect your account.
				</span>
			</div>
			<QrLogin
				title="Sign in"
				onAuthenticated={() => {
					qc.invalidateQueries();
					navigate({ to: "/" });
				}}
			/>
		</div>
	);
}
