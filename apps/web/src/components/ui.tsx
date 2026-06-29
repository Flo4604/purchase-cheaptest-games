import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, font, radius, shadow, space } from "../tokens.stylex";

const spin = stylex.keyframes({
	from: { transform: "rotate(0deg)" },
	to: { transform: "rotate(360deg)" },
});

const s = stylex.create({
	panel: {
		background: colors.surface,
		border: `1px solid ${colors.hair}`,
		borderRadius: radius.lg,
		padding: space.lg,
		display: "flex",
		flexDirection: "column",
		gap: space.md,
	},

	btn: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: "6px",
		fontFamily: font.sans,
		fontSize: "14px",
		fontWeight: 600,
		lineHeight: 1,
		borderRadius: radius.sm,
		padding: "10px 16px",
		border: "1px solid transparent",
		cursor: "pointer",
		whiteSpace: "nowrap",
		transition: "background 120ms, border-color 120ms, color 120ms, opacity 120ms",
		outline: "none",
		boxShadow: { default: null, ":focus-visible": shadow.ring },
		opacity: { default: 1, ":disabled": 0.45 },
	},
	btnSm: { padding: "6px 10px", fontSize: "13px" },
	primary: {
		background: { default: colors.accent, ":hover": "#d4f968" },
		color: colors.onAccent,
		fontWeight: 700,
	},
	secondary: {
		background: { default: "transparent", ":hover": colors.surface },
		borderColor: { default: colors.hairStrong, ":hover": colors.muted },
		color: colors.text,
	},
	ghost: {
		background: "transparent",
		color: { default: colors.muted, ":hover": colors.text },
		padding: "8px 6px",
	},
	danger: {
		background: "transparent",
		color: { default: colors.danger, ":hover": colors.danger },
		borderColor: { default: colors.hairStrong, ":hover": colors.danger },
	},

	field: { display: "flex", flexDirection: "column", gap: space.xs },
	label: { fontSize: "11px", fontWeight: 600, color: colors.faint, textTransform: "uppercase", letterSpacing: "0.7px" },
	input: {
		width: "100%",
		boxSizing: "border-box",
		background: colors.bg,
		border: `1px solid ${colors.hair}`,
		borderRadius: radius.sm,
		padding: "10px 12px",
		color: colors.text,
		fontSize: "15px",
		fontFamily: font.mono,
		outline: "none",
		transition: "border-color 120ms, box-shadow 120ms",
		borderColor: { default: colors.hair, ":focus": colors.accent },
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
		borderRadius: "3px",
		border: `1px solid ${colors.hairStrong}`,
		background: colors.bg,
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
		gap: "6px",
		fontSize: "11px",
		fontWeight: 600,
		fontFamily: font.mono,
		textTransform: "uppercase",
		letterSpacing: "0.5px",
		color: colors.muted,
	},
	badgeDot: { width: "6px", height: "6px", borderRadius: "50%", background: "currentColor" },

	stat: { display: "flex", flexDirection: "column", gap: "3px" },
	statNum: { fontSize: "26px", fontWeight: 800, color: colors.text, fontFamily: font.mono, lineHeight: 1, letterSpacing: "-0.5px" },
	statLabel: { fontSize: "10px", fontWeight: 600, color: colors.faint, textTransform: "uppercase", letterSpacing: "0.8px" },

	track: { height: "3px", width: "100%", background: colors.hair, overflow: "hidden" },
	fill: { height: "100%", background: colors.accent, transition: "width 200ms ease" },

	spinner: {
		width: "14px",
		height: "14px",
		borderRadius: "50%",
		border: `2px solid ${colors.hairStrong}`,
		borderTopColor: colors.accent,
		animationName: spin,
		animationDuration: "0.7s",
		animationIterationCount: "infinite",
		animationTimingFunction: "linear",
	},
});

const toneColor = stylex.create({
	neutral: { color: colors.muted },
	accent: { color: colors.accent },
	success: { color: colors.success },
	warn: { color: colors.warn },
	danger: { color: colors.danger },
});
export type Tone = keyof typeof toneColor;

export function Panel({ children }: { children: ReactNode }) {
	return <div {...stylex.props(s.panel)}>{children}</div>;
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
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
		<button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} {...stylex.props(s.check)}>
			<span {...stylex.props(s.box, checked && s.boxOn)}>{checked ? "✓" : ""}</span>
			{label}
		</button>
	);
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
	return (
		<span {...stylex.props(s.badge, toneColor[tone])}>
			<span {...stylex.props(s.badgeDot)} />
			{children}
		</span>
	);
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

const f = stylex.create({
	segmented: { display: "inline-flex", flexWrap: "wrap", gap: "3px", border: `1px solid ${colors.hair}`, borderRadius: radius.md, padding: "3px", background: colors.bg },
	seg: {
		padding: "7px 13px",
		borderRadius: radius.sm,
		border: "none",
		background: { default: "transparent", ":hover": colors.surface },
		color: { default: colors.muted, ":hover": colors.text },
		fontSize: "13px",
		fontWeight: 600,
		fontFamily: font.sans,
		cursor: "pointer",
		transition: "background 120ms, color 120ms",
	},
	segOn: { background: colors.surface, color: colors.accent, ":hover": { background: colors.surface } },
	chips: { display: "flex", flexWrap: "wrap", gap: space.sm },
	chip: {
		padding: "7px 12px",
		borderRadius: radius.pill,
		border: `1px solid ${colors.hairStrong}`,
		background: { default: "transparent", ":hover": colors.surface },
		color: colors.muted,
		fontSize: "13px",
		fontFamily: font.sans,
		cursor: "pointer",
		transition: "border-color 120ms, color 120ms, background 120ms",
	},
	chipOn: { borderColor: colors.accent, color: colors.accent, background: "rgba(199,242,75,0.08)" },
	textarea: {
		width: "100%",
		boxSizing: "border-box",
		minHeight: "96px",
		resize: "vertical",
		background: colors.bg,
		border: `1px solid ${colors.hair}`,
		borderRadius: radius.sm,
		padding: "10px 12px",
		color: colors.text,
		fontSize: "14px",
		fontFamily: font.mono,
		outline: "none",
		borderColor: { default: colors.hair, ":focus": colors.accent },
		boxShadow: { default: null, ":focus": shadow.ring },
	},
	switchRow: { display: "inline-flex", alignItems: "center", gap: space.sm, cursor: "pointer", background: "none", border: "none", padding: 0, color: colors.text, fontSize: "14px" },
	track: { width: "34px", height: "20px", borderRadius: radius.pill, background: colors.hairStrong, padding: "2px", transition: "background 120ms", display: "flex", alignItems: "center", flexShrink: 0 },
	trackOn: { background: colors.accent },
	knob: { width: "16px", height: "16px", borderRadius: "50%", background: colors.text, transition: "transform 120ms" },
	knobOn: { transform: "translateX(14px)", background: colors.onAccent },
});

export function Segmented<T extends string>({
	value,
	onChange,
	options,
}: {
	value: T;
	onChange: (v: T) => void;
	options: { label: string; value: T }[];
}) {
	return (
		<div {...stylex.props(f.segmented)}>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					onClick={() => onChange(o.value)}
					{...stylex.props(f.seg, o.value === value && f.segOn)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

export function ChipGroup({
	value,
	onChange,
	options,
}: {
	value: number;
	onChange: (v: number) => void;
	options: { label: string; bit: number }[];
}) {
	return (
		<div {...stylex.props(f.chips)}>
			{options.map((o) => {
				const on = (value & o.bit) !== 0;
				return (
					<button
						key={o.bit}
						type="button"
						onClick={() => onChange(on ? value & ~o.bit : value | o.bit)}
						{...stylex.props(f.chip, on && f.chipOn)}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

export function Switch({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: ReactNode;
}) {
	return (
		<button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} {...stylex.props(f.switchRow)}>
			<span {...stylex.props(f.track, checked && f.trackOn)}>
				<span {...stylex.props(f.knob, checked && f.knobOn)} />
			</span>
			{label}
		</button>
	);
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea {...props} {...stylex.props(f.textarea)} />;
}
