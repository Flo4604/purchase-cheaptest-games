import { useEffect, useState } from "react";
import type { ProgressEvent } from "./api.js";

export interface JobStream {
	events: ProgressEvent[];
	/** Terminal status (done/failed/canceled) once the engine emits it. */
	terminal: string | null;
	connected: boolean;
}

// Subscribe to live job progress over the WebSocket (proxied at /ws in dev).
// Reconnect-on-disconnect is left for later; the engine keeps the job running
// and the snapshot is re-sent on connect.
export const useJobStream = (jobId: number | null): JobStream => {
	const [events, setEvents] = useState<ProgressEvent[]>([]);
	const [terminal, setTerminal] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		if (jobId == null) return;
		setEvents([]);
		setTerminal(null);

		const proto = window.location.protocol === "https:" ? "wss" : "ws";
		const ws = new WebSocket(
			`${proto}://${window.location.host}/ws/jobs/${jobId}/stream`,
		);
		ws.onopen = () => setConnected(true);
		ws.onmessage = (e) => {
			try {
				const ev = JSON.parse(e.data as string) as ProgressEvent;
				setEvents((prev) => [...prev, ev]);
				if (ev.step === "status") setTerminal(ev.message);
			} catch {
				/* ignore malformed frames */
			}
		};
		ws.onclose = () => setConnected(false);
		ws.onerror = () => setConnected(false);
		return () => ws.close();
	}, [jobId]);

	return { events, terminal, connected };
};
