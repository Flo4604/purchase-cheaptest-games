import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

// libSQL works for both a local SQLite file (file: URL) and Turso (libsql://
// + auth token), so the same client carries us from local dev to the cloud.
const url = process.env.DATABASE_URL ?? "file:local.sqlite";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

export const db = drizzle(client, { schema });
