import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { colors, font, space } from "../tokens.stylex";

export const Route = createFileRoute("/")({
	component: Home,
});

const styles = stylex.create({
	main: {
		minHeight: "100vh",
		display: "flex",
		flexDirection: "column",
		gap: space.sm,
		padding: space.lg,
		fontFamily: font.sans,
		color: colors.text,
	},
	muted: {
		color: colors.muted,
	},
});

function Home() {
	return (
		<main {...stylex.props(styles.main)}>
			<h1>Steam Purchase Helper</h1>
			<p {...stylex.props(styles.muted)}>
				Web dashboard scaffold. Dashboard, flow launchers, and live job view
				land in Phase 5.
			</p>
		</main>
	);
}
