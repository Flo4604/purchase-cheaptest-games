import * as stylex from "@stylexjs/stylex";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { api, type QrStatus } from "../lib/api.js";
import { colors, radius, space } from "../tokens.stylex";
import { Button, Card } from "./ui.js";

const s = stylex.create({
	wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: space.md },
	title: { fontSize: "16px", fontWeight: 700, color: colors.text },
	qr: { borderRadius: radius.md, background: "#fff", padding: space.sm, width: "220px", height: "220px" },
	placeholder: { width: "220px", height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: colors.muted, border: `1px dashed ${colors.border}`, borderRadius: radius.md },
	hint: { fontSize: "13px", color: colors.muted, textAlign: "center" },
	error: { color: colors.danger, fontSize: "13px" },
});

const message: Record<QrStatus, string> = {
	pending: "Scan with the Steam mobile app, then approve the login.",
	authenticated: "Authenticated! Redirecting…",
	timeout: "QR code expired.",
	error: "Something went wrong.",
};

export function QrLogin({
	title,
	onAuthenticated,
}: {
	title: string;
	onAuthenticated: () => void;
}) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	const [status, setStatus] = useState<QrStatus>("pending");
	const [nonce, setNonce] = useState(0);
	const cb = useRef(onAuthenticated);
	cb.current = onAuthenticated;

	useEffect(() => {
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | undefined;
		setStatus("pending");
		setDataUrl(null);

		(async () => {
			try {
				const { qrId, challengeUrl } = await api.qrStart();
				if (stopped) return;
				setDataUrl(await QRCode.toDataURL(challengeUrl, { width: 220, margin: 1 }));
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

	return (
		<Card>
			<div {...stylex.props(s.wrap)}>
				<span {...stylex.props(s.title)}>{title}</span>
				{dataUrl ? (
					<img {...stylex.props(s.qr)} src={dataUrl} alt="Steam login QR" />
				) : (
					<div {...stylex.props(s.placeholder)}>Loading QR…</div>
				)}
				<span {...stylex.props(s.hint)}>{message[status]}</span>
				{(status === "timeout" || status === "error") && (
					<Button onClick={() => setNonce((n) => n + 1)}>New QR code</Button>
				)}
			</div>
		</Card>
	);
}
