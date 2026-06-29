import * as stylex from "@stylexjs/stylex";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { colors, font, radius, space } from "../tokens.stylex";
import "../styles.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Steam Purchase Helper" },
		],
	}),
	component: RootComponent,
});

const s = stylex.create({
	header: {
		position: "sticky",
		top: 0,
		zIndex: 20,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: `${space.md} ${space.lg}`,
		borderBottom: `1px solid ${colors.border}`,
		background: "rgba(10, 12, 16, 0.7)",
		backdropFilter: "blur(10px)",
	},
	brand: {
		display: "flex",
		alignItems: "center",
		gap: space.sm,
		textDecoration: "none",
		color: colors.text,
	},
	logo: {
		width: "26px",
		height: "26px",
		borderRadius: radius.sm,
		background: `linear-gradient(135deg, ${colors.accent}, #2d6fd6)`,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "15px",
	},
	brandName: { fontWeight: 700, fontSize: "15px", letterSpacing: "0.2px" },
	main: {
		maxWidth: "1080px",
		margin: "0 auto",
		padding: `${space.xl} ${space.lg}`,
		fontFamily: font.sans,
	},
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	const [queryClient] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<header {...stylex.props(s.header)}>
						<Link to="/" {...stylex.props(s.brand)}>
							<span {...stylex.props(s.logo)}>🎮</span>
							<span {...stylex.props(s.brandName)}>Purchase Helper</span>
						</Link>
					</header>
					<main {...stylex.props(s.main)}>{children}</main>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}
