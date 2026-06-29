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
import { colors, font, space } from "../tokens.stylex";
import "../styles.css"; // StyleX CSS entry — loaded on every route

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
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: `${space.md} ${space.lg}`,
		borderBottom: `1px solid ${colors.border}`,
	},
	brand: {
		fontWeight: 700,
		fontSize: "15px",
		color: colors.text,
		textDecoration: "none",
		letterSpacing: "0.2px",
	},
	main: {
		maxWidth: "920px",
		margin: "0 auto",
		padding: space.lg,
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
							⚙ Steam Purchase Helper
						</Link>
					</header>
					<main {...stylex.props(s.main)}>{children}</main>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}
