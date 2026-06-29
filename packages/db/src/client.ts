import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as pgliteMigrate } from "drizzle-orm/pglite/migrator";
import { drizzle as postgresDrizzle } from "drizzle-orm/postgres-js";
import { migrate as postgresMigrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

// One schema, two drivers, picked by DATABASE_URL:
//   - postgres:// (or postgresql://) → postgres-js, for real Postgres in prod
//   - anything else / unset          → pglite, an embedded Postgres for dev &
//     tests (zero external setup; persists to a local directory)
const url = process.env.DATABASE_URL ?? "";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

const build = () => {
	if (isPostgres) {
		const client = postgres(url, { max: 10 });
		const db = postgresDrizzle(client, { schema });
		return { db, runMigrations: () => postgresMigrate(db, { migrationsFolder }) };
	}
	// pglite data dir: DATABASE_URL as a file path, else ./.pgdata
	const dataDir = url.replace(/^file:/, "") || "./.pgdata";
	const client = new PGlite(dataDir);
	const db = pgliteDrizzle(client, { schema });
	return { db, runMigrations: () => pgliteMigrate(db, { migrationsFolder }) };
};

const built = build();

// Both drivers share the same query API; cast to one concrete type so consumers
// get consistent inference regardless of which driver is active.
export const db = built.db as PgliteDatabase<typeof schema>;

/** Apply pending migrations. The engine calls this once on boot. */
export const runMigrations = (): Promise<void> =>
	built.runMigrations() as Promise<void>;
