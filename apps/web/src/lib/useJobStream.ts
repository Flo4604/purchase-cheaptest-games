import { useEffect, useState } from "react";
import type { ProgressEvent } from "./api.js";

export interface JobStream {
	events: ProgressEvent[];
	/** Terminal status (done/failed/canceled) once the engine emits it. */
	terminal: string | null;
	connected: boolean;
}

// Subscribe to live job progress over the WebSocket (proxied at /ws in dev).
// Reconnects with capped exponential backoff if the socket drops while the job
// is still running — the engine keeps running and re-sends the snapshot on
// reconnect. Stops reconnecting once a terminal status arrives or on unmount.
export const useJobStream = (jobId: number | null): JobStream => {
	const [events, setEvents] = useState<ProgressEvent[]>([]);
	const [terminal, setTerminal] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		if (jobId == null) return;
		setEvents([]);
		setTerminal(null);

		let stopped = false;
		let isTerminal = false;
		let attempt = 0;
		let ws: WebSocket | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			const proto = window.location.protocol === "https:" ? "wss" : "ws";
			ws = new WebSocket(`${proto}://${window.location.host}/ws/jobs/${jobId}/stream`);
			ws.onopen = () => {
				attempt = 0;
				setConnected(true);
			};
			ws.onmessage = (e) => {
				try {
					const ev = JSON.parse(e.data as string) as ProgressEvent;
					setEvents((prev) => [...prev, ev]);
					if (ev.step === "status") {
						isTerminal = true;
						setTerminal(ev.message);
					}
				} catch {
					/* ignore malformed frames */
				}
			};
			ws.onclose = () => {
				setConnected(false);
				if (stopped || isTerminal) return;
				attempt += 1;
				const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
				retry = setTimeout(connect, delay);
			};
			ws.onerror = () => {
				try {
					ws?.close();
				} catch {
					/* noop */
				}
			};
		};

		connect();
		return () => {
			stopped = true;
			if (retry) clearTimeout(retry);
			ws?.close();
		};
	}, [jobId]);

	return { events, terminal, connected };
};
