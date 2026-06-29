import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { api, type QrStatus } from "../lib/api.js";
import { colors, font, radius, space } from "../tokens.stylex";
import { Button, Spinner } from "./ui.js";

const s = stylex.create({
	wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: space.md },
	qrFrame: {
		width: "240px",
		height: "240px",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: space.md,
		borderRadius: radius.lg,
		background: colors.surface,
		border: `1px solid ${colors.hair}`,
	},
	placeholder: { display: "flex", alignItems: "center", justifyContent: "center", color: colors.muted, gap: space.sm, fontSize: "13px" },
	statusRow: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "13px", color: colors.muted },
	live: { width: "7px", height: "7px", borderRadius: "50%", background: colors.accent },
	mono: { fontFamily: font.mono, fontSize: "12px", color: colors.faint },
});

const hint: Record<QrStatus, string> = {
	pending: "Steam app → ☰ → scan QR → approve",
	authenticated: "Authenticated. Redirecting…",
	timeout: "QR expired",
	error: "Couldn't reach Steam",
};

export function QrLogin({
	title,
	onAuthenticated,
}: {
	title: string;
	onAuthenticated: () => void;
}) {
	const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
	const [status, setStatus] = useState<QrStatus>("pending");
	const [nonce, setNonce] = useState(0);
	const cb = useRef(onAuthenticated);
	cb.current = onAuthenticated;
	const frameRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | undefined;
		setStatus("pending");
		setChallengeUrl(null);
		(async () => {
			try {
				const { qrId, challengeUrl: url } = await api.qrStart();
				if (stopped) return;
				setChallengeUrl(url);
				timer = setInterval(async () => {
					try {
						const { status: next } = await api.qrStatus(qrId);
						if (stopped) return;
						setStatus(next);
						if (next === "authenticated") {
							clearInterval(timer);
							cb.current();
						} else if (next === "timeout" || next === "error") {
							clearInterval(timer);
						}
					} catch {
						/* keep polling */
					}
				}, 2000);
			} catch {
				if (!stopped) setStatus("error");
			}
		})();
		return () => {
			stopped = true;
			if (timer) clearInterval(timer);
		};
	}, [nonce]);

	useEffect(() => {
		if (!challengeUrl || !frameRef.current) return;
		let cancelled = false;
		const el = frameRef.current;
		(async () => {
			const { default: QRCodeStyling } = await import("qr-code-styling");
			if (cancelled) return;
			el.replaceChildren();
			new QRCodeStyling({
				width: 208,
				height: 208,
				type: "svg",
				data: challengeUrl,
				margin: 0,
				dotsOptions: { color: "#f4f3f0", type: "rounded" },
				backgroundOptions: { color: "transparent" },
				cornersSquareOptions: { color: "#f4f3f0", type: "extra-rounded" },
				cornersDotOptions: { color: "#c7f24b", type: "dot" },
			}).append(el);
		})();
		return () => {
			cancelled = true;
		};
	}, [challengeUrl]);

	return (
		<div {...stylex.props(s.wrap)}>
			<div ref={frameRef} {...stylex.props(s.qrFrame)}>
				{!challengeUrl && (
					<span {...stylex.props(s.placeholder)}>
						<Spinner /> generating…
					</span>
				)}
			</div>
			<div {...stylex.props(s.statusRow)}>
				{status === "pending" && <span {...stylex.props(s.live)} />}
				<span {...stylex.props(s.mono)}>{hint[status]}</span>
			</div>
			{(status === "timeout" || status === "error") && (
				<Button variant="secondary" size="sm" onClick={() => setNonce((n) => n + 1)}>
					New QR code
				</Button>
			)}
		</div>
	);
}
