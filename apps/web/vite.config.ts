import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import stylex from "@stylexjs/unplugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: { port: 3100 },
	plugins: [
		tsConfigPaths(),
		// StyleX must run before the React plugin (Fast Refresh). It appends
		// compiled CSS to an existing CSS asset — src/styles.css must be imported
		// on every route (done in __root.tsx) or styles vanish in the build.
		stylex.vite({
			useCSSLayers: true,
			dev: process.env.NODE_ENV === "development",
			runtimeInjection: false,
			unstable_moduleResolution: {
				type: "commonJS",
				rootDir: import.meta.dirname,
			},
		}),
		tanstackStart(),
		viteReact(),
	],
});
