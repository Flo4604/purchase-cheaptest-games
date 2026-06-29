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
import "../styles.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Purchase Helper" },
		],
	}),
	component: RootComponent,
});

const s = stylex.create({
	header: {
		borderBottom: `1px solid ${colors.hair}`,
	},
	headerInner: {
		maxWidth: "1000px",
		marginInline: "auto",
		padding: `${space.md} ${space.lg}`,
		display: "flex",
		alignItems: "center",
	},
	brand: {
		display: "inline-flex",
		alignItems: "center",
		gap: space.sm,
		textDecoration: "none",
		color: colors.text,
		fontWeight: 800,
		fontSize: "15px",
		letterSpacing: "-0.2px",
	},
	mark: { width: "9px", height: "9px", background: colors.accent, borderRadius: "2px" },
	main: {
		maxWidth: "1000px",
		marginInline: "auto",
		padding: `${space.xl} ${space.lg} ${space.xxl}`,
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
						<div {...stylex.props(s.headerInner)}>
							<Link to="/" {...stylex.props(s.brand)}>
								<span {...stylex.props(s.mark)} />
								Purchase&nbsp;Helper
							</Link>
						</div>
					</header>
					<main {...stylex.props(s.main)}>{children}</main>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}
