import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, font, radius, shadow, space } from "../tokens.stylex";

const spin = stylex.keyframes({
	from: { transform: "rotate(0deg)" },
	to: { transform: "rotate(360deg)" },
});

const s = stylex.create({
	card: {
		background: colors.surface,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.lg,
		padding: space.lg,
		boxShadow: shadow.card,
		display: "flex",
		flexDirection: "column",
		gap: space.md,
	},
	cardHover: {
		transition: "border-color 140ms, transform 140ms",
		borderColor: { default: colors.border, ":hover": colors.borderStrong },
		transform: { default: null, ":hover": "translateY(-2px)" },
	},

	btn: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: space.sm,
		fontFamily: font.sans,
		fontSize: "14px",
		fontWeight: 600,
		lineHeight: 1,
		borderRadius: radius.md,
		padding: `10px 16px`,
		border: "1px solid transparent",
		cursor: "pointer",
		whiteSpace: "nowrap",
		transition: "background 120ms, border-color 120ms, opacity 120ms",
		outline: { default: "none", ":focus-visible": "none" },
		boxShadow: { default: null, ":focus-visible": shadow.ring },
		opacity: { default: 1, ":disabled": 0.5 },
	},
	btnSm: { padding: "6px 12px", fontSize: "13px" },
	primary: {
		background: { default: colors.accent, ":hover": colors.accentHover },
		color: colors.onAccent,
	},
	secondary: {
		background: { default: colors.surfaceHover, ":hover": colors.border },
		borderColor: colors.borderStrong,
		color: colors.text,
	},
	ghost: {
		background: { default: "transparent", ":hover": colors.surfaceHover },
		color: colors.muted,
	},
	danger: {
		background: { default: "transparent", ":hover": colors.accentSoft },
		borderColor: colors.danger,
		color: colors.danger,
	},

	field: { display: "flex", flexDirection: "column", gap: space.xs },
	label: { fontSize: "12px", fontWeight: 500, color: colors.muted },
	input: {
		width: "100%",
		boxSizing: "border-box",
		background: colors.bgElev,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: "10px 12px",
		color: colors.text,
		fontSize: "14px",
		fontFamily: font.sans,
		outline: "none",
		transition: "border-color 120ms, box-shadow 120ms",
		borderColor: { default: colors.border, ":focus": colors.accent },
		boxShadow: { default: null, ":focus": shadow.ring },
	},

	check: {
		display: "inline-flex",
		alignItems: "center",
		gap: space.sm,
		fontSize: "14px",
		color: colors.text,
		cursor: "pointer",
		background: "none",
		border: "none",
		padding: 0,
		textAlign: "start",
	},
	box: {
		width: "18px",
		height: "18px",
		flexShrink: 0,
		borderRadius: "6px",
		border: `1px solid ${colors.borderStrong}`,
		background: colors.bgElev,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "12px",
		color: colors.onAccent,
		transition: "background 120ms, border-color 120ms",
	},
	boxOn: { background: colors.accent, borderColor: colors.accent },

	badge: {
		display: "inline-flex",
		alignItems: "center",
		gap: "5px",
		fontSize: "12px",
		fontWeight: 600,
		fontFamily: font.mono,
		padding: "2px 9px",
		borderRadius: radius.pill,
		border: "1px solid transparent",
	},

	stat: { display: "flex", flexDirection: "column", gap: "2px" },
	statNum: {
		fontSize: "20px",
		fontWeight: 700,
		color: colors.text,
		fontFamily: font.mono,
		lineHeight: 1.1,
	},
	statLabel: {
		fontSize: "10px",
		fontWeight: 600,
		color: colors.faint,
		textTransform: "uppercase",
		letterSpacing: "0.6px",
	},

	track: {
		height: "6px",
		width: "100%",
		background: colors.bgElev,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.pill,
		overflow: "hidden",
	},
	fill: {
		height: "100%",
		background: colors.accent,
		borderRadius: radius.pill,
		transition: "width 200ms ease",
	},

	spinner: {
		width: "14px",
		height: "14px",
		borderRadius: "50%",
		border: `2px solid ${colors.borderStrong}`,
		borderTopColor: colors.accent,
		animationName: spin,
		animationDuration: "0.7s",
		animationIterationCount: "infinite",
		animationTimingFunction: "linear",
	},
});

const tone = stylex.create({
	neutral: { color: colors.muted, background: colors.surfaceHover, borderColor: colors.border },
	accent: { color: colors.accent, background: colors.accentSoft, borderColor: "transparent" },
	success: { color: colors.success, background: "rgba(69,212,131,0.12)", borderColor: "transparent" },
	warn: { color: colors.warn, background: "rgba(245,185,69,0.12)", borderColor: "transparent" },
	danger: { color: colors.danger, background: "rgba(255,106,106,0.12)", borderColor: "transparent" },
});

export type Tone = keyof typeof tone;

export function Card({
	children,
	hover,
}: {
	children: ReactNode;
	hover?: boolean;
}) {
	return <div {...stylex.props(s.card, hover && s.cardHover)}>{children}</div>;
}

export function Button({
	variant = "secondary",
	size = "md",
	...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary" | "ghost" | "danger";
	size?: "md" | "sm";
}) {
	return (
		<button
			type="button"
			{...rest}
			{...stylex.props(s.btn, size === "sm" && s.btnSm, s[variant])}
		/>
	);
}

export function Field({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<label {...stylex.props(s.field)}>
			<span {...stylex.props(s.label)}>{label}</span>
			{children}
		</label>
	);
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} {...stylex.props(s.input)} />;
}

export function Checkbox({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: ReactNode;
}) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			{...stylex.props(s.check)}
		>
			<span {...stylex.props(s.box, checked && s.boxOn)}>{checked ? "✓" : ""}</span>
			{label}
		</button>
	);
}

export function Badge({ children, tone: t = "neutral" }: { children: ReactNode; tone?: Tone }) {
	return <span {...stylex.props(s.badge, tone[t])}>{children}</span>;
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
	return (
		<div {...stylex.props(s.stat)}>
			<span {...stylex.props(s.statNum)}>{value}</span>
			<span {...stylex.props(s.statLabel)}>{label}</span>
		</div>
	);
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
	const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
	return (
		<div {...stylex.props(s.track)}>
			<div {...stylex.props(s.fill)} style={{ width: `${pct}%` }} />
		</div>
	);
}

export function Spinner() {
	return <span {...stylex.props(s.spinner)} />;
}
