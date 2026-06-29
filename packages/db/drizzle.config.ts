import { defineConfig } from "drizzle-kit";

// Postgres dialect. Migrations are generated offline (diff vs snapshot) and
// applied by the engine on boot (see client.ts runMigrations). For local
// drizzle-kit push/studio we point at the embedded pglite data dir.
const url = process.env.DATABASE_URL ?? "";
const isPostgres =
	url.startsWith("postgres://") || url.startsWith("postgresql://");

export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	...(isPostgres
		? { dbCredentials: { url } }
		: { driver: "pglite", dbCredentials: { url: url.replace(/^file:/, "") || "./.pgdata" } }),
});
