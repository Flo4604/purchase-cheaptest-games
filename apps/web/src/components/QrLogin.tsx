import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { api, type QrStatus } from "../lib/api.js";
import { colors, font, radius, space } from "../tokens.stylex";
import { Button, Spinner } from "./ui.js";

const s = stylex.create({
	wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: space.md },
	qrFrame: {
		width: "236px",
		height: "236px",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: space.sm,
		borderRadius: radius.lg,
		background: colors.bgElev,
		border: `1px solid ${colors.border}`,
	},
	placeholder: { display: "flex", alignItems: "center", justifyContent: "center", color: colors.muted, gap: space.sm },
	statusRow: { display: "flex", alignItems: "center", gap: space.sm, fontSize: "13px", color: colors.muted },
	live: { width: "7px", height: "7px", borderRadius: "50%", background: colors.success },
	hint: { fontSize: "13px", color: colors.muted, textAlign: "center", maxWidth: "240px" },
	steps: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: colors.faint, fontFamily: font.mono },
});

const hint: Record<QrStatus, string> = {
	pending: "Open the Steam mobile app → menu → scan QR, then approve.",
	authenticated: "Authenticated! Redirecting…",
	timeout: "QR code expired — generate a new one.",
	error: "Couldn't reach Steam. Try again.",
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

	// Start a QR session + poll for completion.
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
						/* transient — keep polling */
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

	// Render the styled QR (client-only; qr-code-styling touches the DOM).
	useEffect(() => {
		if (!challengeUrl || !frameRef.current) return;
		let cancelled = false;
		const el = frameRef.current;
		(async () => {
			const { default: QRCodeStyling } = await import("qr-code-styling");
			if (cancelled) return;
			el.replaceChildren();
			const qr = new QRCodeStyling({
				width: 220,
				height: 220,
				type: "svg",
				data: challengeUrl,
				margin: 4,
				dotsOptions: { color: "#4ea1ff", type: "rounded" },
				backgroundOptions: { color: "transparent" },
				cornersSquareOptions: { color: "#e8ebf0", type: "extra-rounded" },
				cornersDotOptions: { color: "#4ea1ff", type: "dot" },
			});
			qr.append(el);
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
				<span>{hint[status]}</span>
			</div>
			{(status === "timeout" || status === "error") && (
				<Button variant="secondary" size="sm" onClick={() => setNonce((n) => n + 1)}>
					New QR code
				</Button>
			)}
		</div>
	);
}
