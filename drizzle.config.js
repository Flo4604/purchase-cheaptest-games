import { defineConfig } from "drizzle-kit";

// libSQL/Turso dialect. Works against a local file (file:local.sqlite) for dev
// and a Turso database (libsql:// + DATABASE_AUTH_TOKEN) in the cloud.
export default defineConfig({
	schema: "./src/db/schema.js",
	out: "./drizzle",
	dialect: "turso",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "file:local.sqlite",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
});
