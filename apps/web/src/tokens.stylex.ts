import * as stylex from "@stylexjs/stylex";

// Editorial / bold: near-monochrome, generous whitespace, one knife-sharp accent
// (lime). Boldness comes from type + space, not chrome. Hairlines, not cards.

export const colors = stylex.defineVars({
	bg: "#0a0a0b",
	surface: "#101012",
	hair: "#202023",
	hairStrong: "#34343a",
	text: "#f4f3f0",
	muted: "#8a8a90",
	faint: "#5a5a60",
	accent: "#c7f24b",
	accentDim: "#aad63c",
	onAccent: "#0c0e06",
	danger: "#ff5a52",
	warn: "#f5c518",
	success: "#8fdc9b",
});

export const space = stylex.defineVars({
	xs: "4px",
	sm: "8px",
	md: "16px",
	lg: "28px",
	xl: "56px",
	xxl: "96px",
});

export const radius = stylex.defineVars({
	sm: "4px",
	md: "7px",
	lg: "10px",
	pill: "999px",
});

export const font = stylex.defineVars({
	sans: "Inter, -apple-system, system-ui, sans-serif",
	mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
});

export const shadow = stylex.defineVars({
	pop: "0 16px 50px rgba(0,0,0,0.6)",
	ring: "0 0 0 2px rgba(199, 242, 75, 0.4)",
});
