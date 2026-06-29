import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { QrLogin } from "../components/QrLogin.js";
import { space } from "../tokens.stylex";

export const Route = createFileRoute("/login")({ component: LoginPage });

const s = stylex.create({
	wrap: { maxWidth: "320px", margin: "8vh auto", display: "flex", flexDirection: "column", gap: space.md },
});

function LoginPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	return (
		<div {...stylex.props(s.wrap)}>
			<QrLogin
				title="Sign in with Steam"
				onAuthenticated={() => {
					qc.invalidateQueries();
					navigate({ to: "/" });
				}}
			/>
		</div>
	);
}
