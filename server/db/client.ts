import "../lib/env.js";
/**
 * Database connection.
 *
 * Uses libSQL, which speaks SQLite. The exact same schema and queries run
 * against a local file (offline demo on a laptop, no server needed) and
 * against a hosted Turso database (cloud deployment) — only DATABASE_URL
 * changes. That is what keeps the venue demo independent of the wifi.
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "file:./data/safaitrack.db";

// A local file target needs its directory to exist before libSQL opens it.
if (url.startsWith("file:")) {
  const filePath = url.slice("file:".length);
  mkdirSync(dirname(filePath), { recursive: true });
}

export const sqlite = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(sqlite, { schema });
export { schema };
export type Db = typeof db;
