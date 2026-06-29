import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api.js";
import { colors, space } from "../tokens.stylex";
import { Button, Card, Field } from "./ui.js";

const s = stylex.create({
	title: { fontWeight: 600, color: colors.text },
	hint: { fontSize: "12px", color: colors.muted },
	error: { color: colors.danger, fontSize: "13px" },
});

export function AddAccount() {
	const qc = useQueryClient();
	const [username, setUsername] = useState("");
	const [refreshToken, setRefreshToken] = useState("");

	const mutation = useMutation({
		mutationFn: () => api.addAccount({ username, refreshToken }),
		onSuccess: () => {
			setUsername("");
			setRefreshToken("");
			qc.invalidateQueries({ queryKey: ["accounts"] });
		},
	});

	return (
		<Card>
			<div {...stylex.props(s.title)}>Add a Steam account</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					mutation.mutate();
				}}
				style={{ display: "flex", flexDirection: "column", gap: 12 }}
			>
				<Field
					label="Username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					required
				/>
				<Field
					label="Steam refresh token (JWT)"
					value={refreshToken}
					onChange={(e) => setRefreshToken(e.target.value)}
					required
				/>
				<span {...stylex.props(s.hint)}>
					Encrypted at rest under your password — the server only stores
					ciphertext.
				</span>
				{mutation.isError && (
					<div {...stylex.props(s.error)}>{(mutation.error as Error).message}</div>
				)}
				<Button type="submit" variant="primary" disabled={mutation.isPending}>
					{mutation.isPending ? "Adding…" : "Add account"}
				</Button>
			</form>
		</Card>
	);
}
