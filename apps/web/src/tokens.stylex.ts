import * as stylex from "@stylexjs/stylex";

// Design tokens (WEBAPP_PLAN §8): dark-first, restrained accent, tabular
// numerals for prices/counts so live updates don't jitter.

export const colors = stylex.defineVars({
	bg: "#0b0d10",
	surface: "#14171c",
	surfaceHover: "#1b1f26",
	border: "#272b33",
	text: "#e6e8eb",
	muted: "#9aa3ad",
	accent: "#5b8cff",
	accentText: "#ffffff",
	danger: "#ff6b6b",
	success: "#4ade80",
	warn: "#fbbf24",
});

export const space = stylex.defineVars({
	xs: "4px",
	sm: "8px",
	md: "16px",
	lg: "24px",
	xl: "40px",
});

export const radius = stylex.defineVars({
	sm: "6px",
	md: "10px",
	lg: "14px",
	pill: "999px",
});

export const font = stylex.defineVars({
	sans: "Inter, system-ui, sans-serif",
	mono: "'Geist Mono', ui-monospace, SFMono-Regular, monospace",
});
