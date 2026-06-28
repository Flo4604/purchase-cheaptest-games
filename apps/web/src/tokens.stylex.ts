import * as stylex from "@stylexjs/stylex";

// Design tokens (WEBAPP_PLAN §8): dark-first, restrained accent, tabular
// numerals for prices/counts so live updates don't jitter.

export const colors = stylex.defineVars({
	bg: "#0b0d10",
	surface: "#14171c",
	border: "#272b33",
	text: "#e6e8eb",
	muted: "#9aa3ad",
	accent: "#5b8cff",
});

export const space = stylex.defineVars({
	xs: "4px",
	sm: "8px",
	md: "16px",
	lg: "24px",
});

export const font = stylex.defineVars({
	sans: "Inter, system-ui, sans-serif",
	mono: "'Geist Mono', ui-monospace, SFMono-Regular, monospace",
});
