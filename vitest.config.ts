import { defineConfig } from "vitest/config";

// One root config; Vitest auto-discovers every *.test.ts across the workspace —
// no hand-listed files. @effect/vitest provides it.effect/TestClock/layer for
// the Effect-based tests. (Pinned to Vitest 3.2.x: @effect/vitest@0.29 isn't
// compatible with Vitest 4 yet on Effect 3.x.)
export default defineConfig({
	test: {
		include: ["packages/*/src/**/*.test.ts", "apps/engine/src/**/*.test.ts"],
		// @psg/* workspace packages ship .ts source (no build step) — run them
		// through Vite's transform instead of externalizing to raw Node.
		server: { deps: { inline: [/@psg\//] } },
	},
});
