import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, Field } from "../components/ui.js";
import { api } from "../lib/api.js";
import { colors, space } from "../tokens.stylex";

export const Route = createFileRoute("/login")({ component: LoginPage });

const s = stylex.create({
	wrap: { maxWidth: "380px", margin: "8vh auto", display: "flex", flexDirection: "column", gap: space.md },
	title: { fontSize: "20px", fontWeight: 700, color: colors.text },
	row: { display: "flex", gap: space.sm },
	toggle: { color: colors.muted, fontSize: "13px", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 },
	error: { color: colors.danger, fontSize: "13px" },
});

function LoginPage() {
	const navigate = useNavigate();
	const [mode, setMode] = useState<"login" | "register">("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const mutation = useMutation({
		mutationFn: () =>
			mode === "login" ? api.login(email, password) : api.register(email, password),
		onSuccess: () => navigate({ to: "/" }),
	});

	return (
		<div {...stylex.props(s.wrap)}>
			<div {...stylex.props(s.title)}>
				{mode === "login" ? "Log in" : "Create an account"}
			</div>
			<Card>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
					style={{ display: "flex", flexDirection: "column", gap: 16 }}
				>
					<Field
						label="Email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
					<Field
						label="Password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					{mutation.isError && (
						<div {...stylex.props(s.error)}>{(mutation.error as Error).message}</div>
					)}
					<Button type="submit" variant="primary" disabled={mutation.isPending}>
						{mutation.isPending ? "…" : mode === "login" ? "Log in" : "Register"}
					</Button>
				</form>
			</Card>
			<button
				type="button"
				{...stylex.props(s.toggle)}
				onClick={() => setMode(mode === "login" ? "register" : "login")}
			>
				{mode === "login"
					? "No account? Register →"
					: "Already have an account? Log in →"}
			</button>
		</div>
	);
}
