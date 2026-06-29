import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { colors, font, radius, shadow, space } from "../tokens.stylex";

export interface SelectOption {
	label: string;
	value: string;
}

const s = stylex.create({
	wrap: { position: "relative" },
	trigger: {
		width: "100%",
		boxSizing: "border-box",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: space.sm,
		background: colors.bgElev,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		padding: "10px 12px",
		color: colors.text,
		fontSize: "14px",
		fontFamily: font.sans,
		cursor: "pointer",
		outline: "none",
		transition: "border-color 120ms, box-shadow 120ms",
		borderColor: { default: colors.border, ":focus-visible": colors.accent },
		boxShadow: { default: null, ":focus-visible": shadow.ring },
	},
	chev: { color: colors.muted, fontSize: "11px", transition: "transform 140ms" },
	chevOpen: { transform: "rotate(180deg)" },
	popup: {
		position: "absolute",
		top: "calc(100% + 6px)",
		left: 0,
		right: 0,
		zIndex: 30,
		background: colors.surfaceHover,
		border: `1px solid ${colors.borderStrong}`,
		borderRadius: radius.md,
		boxShadow: shadow.pop,
		padding: space.xs,
		display: "flex",
		flexDirection: "column",
		gap: "2px",
		maxHeight: "260px",
		overflowY: "auto",
	},
	item: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: space.sm,
		padding: "8px 10px",
		borderRadius: radius.sm,
		border: "none",
		background: { default: "transparent", ":hover": colors.surface },
		color: colors.text,
		fontSize: "14px",
		fontFamily: font.sans,
		cursor: "pointer",
		textAlign: "start",
		width: "100%",
	},
	itemActive: { background: colors.accentSoft, color: colors.accent },
	tick: { color: colors.accent, fontSize: "12px" },
});

export function Select({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, [open]);

	const selected = options.find((o) => o.value === value);

	return (
		<div ref={ref} {...stylex.props(s.wrap)}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				{...stylex.props(s.trigger)}
			>
				<span>{selected?.label ?? "Select…"}</span>
				<span {...stylex.props(s.chev, open && s.chevOpen)}>▾</span>
			</button>
			{open && (
				<div {...stylex.props(s.popup)}>
					{options.map((o) => (
						<button
							key={o.value}
							type="button"
							onClick={() => {
								onChange(o.value);
								setOpen(false);
							}}
							{...stylex.props(s.item, o.value === value && s.itemActive)}
						>
							<span>{o.label}</span>
							{o.value === value && <span {...stylex.props(s.tick)}>✓</span>}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
