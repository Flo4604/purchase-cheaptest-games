import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import stylex from "@stylexjs/unplugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: {
		port: 3100,
		// Same-origin in dev so the engine's httpOnly session cookie just works
		// (no CORS / SameSite headaches). /api -> engine HTTP, /ws -> engine WS.
		proxy: {
			"/api": {
				target: process.env.ENGINE_URL ?? "http://localhost:3101",
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/api/, ""),
			},
			"/ws": {
				target: process.env.ENGINE_WS_URL ?? "ws://localhost:3102",
				ws: true,
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/ws/, ""),
			},
		},
	},
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
