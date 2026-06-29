// Public surface of the data layer: the Drizzle client + the table schema.
// Call sites query directly — `db.select().from(account)...` — no repository
// wrappers. Import operators (eq, and, desc, …) straight from "drizzle-orm".
export { db, runMigrations } from "./client.js";
export * from "./schema.js";
