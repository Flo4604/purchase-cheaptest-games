import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { colors, font, radius, shadow, space } from "../tokens.stylex";

const s = stylex.create({
	overlay: {
		position: "fixed",
		inset: 0,
		zIndex: 50,
		background: "rgba(4, 6, 10, 0.6)",
		backdropFilter: "blur(4px)",
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "center",
		padding: space.lg,
		overflowY: "auto",
	},
	panel: {
		marginTop: "8vh",
		width: "100%",
		maxWidth: "440px",
		background: colors.surface,
		border: `1px solid ${colors.borderStrong}`,
		borderRadius: radius.lg,
		boxShadow: shadow.pop,
		display: "flex",
		flexDirection: "column",
	},
	head: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: `${space.md} ${space.lg}`,
		borderBottom: `1px solid ${colors.border}`,
	},
	title: { fontSize: "15px", fontWeight: 700, color: colors.text, fontFamily: font.sans },
	close: {
		background: { default: "transparent", ":hover": colors.surfaceHover },
		border: "none",
		color: colors.muted,
		fontSize: "18px",
		lineHeight: 1,
		cursor: "pointer",
		borderRadius: radius.sm,
		width: "28px",
		height: "28px",
	},
	body: { padding: space.lg, display: "flex", flexDirection: "column", gap: space.md },
});

export function Modal({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open || typeof document === "undefined") return null;

	return createPortal(
		<div {...stylex.props(s.overlay)} onMouseDown={onClose}>
			<div {...stylex.props(s.panel)} onMouseDown={(e) => e.stopPropagation()}>
				<div {...stylex.props(s.head)}>
					<span {...stylex.props(s.title)}>{title}</span>
					<button type="button" onClick={onClose} {...stylex.props(s.close)}>
						×
					</button>
				</div>
				<div {...stylex.props(s.body)}>{children}</div>
			</div>
		</div>,
		document.body,
	);
}
