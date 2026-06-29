import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, font, radius, space } from "../tokens.stylex";

const s = stylex.create({
	card: {
		background: colors.surface,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.lg,
		padding: space.lg,
		display: "flex",
		flexDirection: "column",
		gap: space.md,
	},
	button: {
		appearance: "none",
		border: `1px solid ${colors.border}`,
		background: { default: colors.surfaceHover, ":hover": colors.border },
		color: colors.text,
		borderRadius: radius.md,
		padding: `${space.sm} ${space.md}`,
		fontSize: "14px",
		fontFamily: font.sans,
		cursor: "pointer",
	},
	primary: {
		background: { default: colors.accent, ":hover": colors.accent },
		borderColor: colors.accent,
		color: colors.accentText,
		fontWeight: 600,
	},
	danger: {
		borderColor: colors.danger,
		color: colors.danger,
		background: "transparent",
	},
	input: {
		background: colors.bg,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: `${space.sm} ${space.md}`,
		color: colors.text,
		fontSize: "14px",
		fontFamily: font.sans,
		width: "100%",
		boxSizing: "border-box",
	},
	field: { display: "flex", flexDirection: "column", gap: space.xs },
	label: { fontSize: "13px", color: colors.muted },
});

export function Card(props: { children: ReactNode }) {
	return <div {...stylex.props(s.card)}>{props.children}</div>;
}

export function Button({
	variant = "default",
	...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "default" | "primary" | "danger";
}) {
	return (
		<button
			type="button"
			{...rest}
			{...stylex.props(
				s.button,
				variant === "primary" && s.primary,
				variant === "danger" && s.danger,
			)}
		/>
	);
}

export function Field({
	label,
	...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
	return (
		<label {...stylex.props(s.field)}>
			<span {...stylex.props(s.label)}>{label}</span>
			<input {...rest} {...stylex.props(s.input)} />
		</label>
	);
}
