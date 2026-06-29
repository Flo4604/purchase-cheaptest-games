import * as stylex from "@stylexjs/stylex";

// Dark, dense-but-calm, restrained blue accent (WEBAPP_PLAN §8). Tabular
// numerals for prices/counts so live updates don't jitter.

export const colors = stylex.defineVars({
	bg: "#0a0c10",
	bgElev: "#0f131a",
	surface: "#141922",
	surfaceHover: "#1a212c",
	border: "#222a36",
	borderStrong: "#2f3a49",
	text: "#e8ebf0",
	muted: "#8b95a3",
	faint: "#5b6573",
	accent: "#4ea1ff",
	accentHover: "#6bb1ff",
	accentSoft: "rgba(78, 161, 255, 0.14)",
	onAccent: "#06121f",
	success: "#45d483",
	warn: "#f5b945",
	danger: "#ff6a6a",
});

export const space = stylex.defineVars({
	xs: "4px",
	sm: "8px",
	md: "14px",
	lg: "22px",
	xl: "36px",
});

export const radius = stylex.defineVars({
	sm: "8px",
	md: "11px",
	lg: "16px",
	pill: "999px",
});

export const font = stylex.defineVars({
	sans: "Inter, -apple-system, system-ui, sans-serif",
	mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
});

export const shadow = stylex.defineVars({
	card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 20px rgba(0,0,0,0.35)",
	pop: "0 10px 40px rgba(0,0,0,0.55)",
	ring: "0 0 0 3px rgba(78, 161, 255, 0.22)",
});
