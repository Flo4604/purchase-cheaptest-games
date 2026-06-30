import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors, font, radius, shadow, space } from "../tokens.stylex";

export interface SelectOption {
	label: string;
	value: string;
}

const s = stylex.create({
	trigger: {
		width: "100%",
		boxSizing: "border-box",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: space.sm,
		background: colors.bg,
		border: `1px solid ${colors.hair}`,
		borderRadius: radius.sm,
		padding: "10px 12px",
		color: colors.text,
		fontSize: "15px",
		fontFamily: font.sans,
		cursor: "pointer",
		outline: "none",
		transition: "border-color 120ms, box-shadow 120ms",
		borderColor: { default: colors.hair, ":focus-visible": colors.accent, ":hover": colors.hairStrong },
		boxShadow: { default: null, ":focus-visible": shadow.ring },
	},
	chev: { color: colors.faint, fontSize: "10px", transition: "transform 140ms" },
	chevOpen: { transform: "rotate(180deg)" },
	// Rendered in a portal with fixed positioning so it's always opaque + on top,
	// regardless of the modal's stacking/overflow context.
	popup: {
		position: "fixed",
		zIndex: 100,
		backgroundColor: colors.surface,
		border: `1px solid ${colors.hairStrong}`,
		borderRadius: radius.md,
		boxShadow: shadow.pop,
		padding: space.xs,
		display: "flex",
		flexDirection: "column",
		gap: "1px",
		maxHeight: "300px",
		overflowY: "auto",
	},
	item: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: space.sm,
		padding: "9px 10px",
		borderRadius: radius.sm,
		border: "none",
		background: { default: "transparent", ":hover": colors.bg },
		color: { default: colors.muted, ":hover": colors.text },
		fontSize: "14px",
		fontFamily: font.sans,
		cursor: "pointer",
		textAlign: "start",
		width: "100%",
	},
	itemActive: { color: colors.text },
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
	const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);

	const place = () => {
		const el = triggerRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		setPos({ top: r.bottom + 6, left: r.left, width: r.width });
	};

	useEffect(() => {
		if (!open) return;
		place();
		const onDoc = (e: MouseEvent) => {
			const t = e.target as Node;
			if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
			setOpen(false);
		};
		const close = () => setOpen(false);
		document.addEventListener("mousedown", onDoc);
		window.addEventListener("scroll", close, true);
		window.addEventListener("resize", close);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			window.removeEventListener("scroll", close, true);
			window.removeEventListener("resize", close);
		};
	}, [open]);

	const selected = options.find((o) => o.value === value);

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((o) => !o)}
				{...stylex.props(s.trigger)}
			>
				<span>{selected?.label ?? "Select…"}</span>
				<span {...stylex.props(s.chev, open && s.chevOpen)}>▾</span>
			</button>
			{open &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						ref={popupRef}
						{...stylex.props(s.popup)}
						style={{ top: pos.top, left: pos.left, width: pos.width }}
					>
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
					</div>,
					document.body,
				)}
		</>
	);
}
