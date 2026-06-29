import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import stylex from "@stylexjs/unplugin";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => {
	const dev = command === "serve";
	return {
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
			stylex.vite({
				useCSSLayers: true,
				dev,
				// In dev, inject StyleX styles at runtime — the extracted-CSS asset
				// isn't reliably served by TanStack Start + Vite 8. Builds still use
				// static CSS extraction (runtimeInjection off).
				runtimeInjection: dev,
				unstable_moduleResolution: {
					type: "commonJS",
					rootDir: import.meta.dirname,
				},
			}),
			tanstackStart(),
			viteReact(),
		],
	};
});
