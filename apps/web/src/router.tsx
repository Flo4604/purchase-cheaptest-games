import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function NotFound() {
	return (
		<div
			style={{
				minHeight: "50vh",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				gap: "12px",
			}}
		>
			<div style={{ fontSize: "40px", fontWeight: 800, letterSpacing: "-1.2px", color: "#f4f3f0" }}>
				404
			</div>
			<div style={{ color: "#8a8a90" }}>That page doesn't exist.</div>
			<Link to="/" style={{ color: "#c7f24b", textDecoration: "none", fontWeight: 700 }}>
				← Back to accounts
			</Link>
		</div>
	);
}

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultNotFoundComponent: NotFound,
	});
}
