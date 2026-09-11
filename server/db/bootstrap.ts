/**
 * First-start database bootstrap.
 *
 * The demo database is a local SQLite file that is deliberately not in the
 * repo, so a fresh checkout — or a fresh Render instance — starts with no
 * tables at all. Until now that showed up as a 500 on every request and an
 * "incorrect password" on the login page. Now the server notices the empty
 * database, creates the schema from the checked-in migration and seeds the
 * demo dataset, then carries on. A database that already has tables is left
 * exactly as it is, so a laptop mid-demo is never reset by a restart.
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resolve } from "node:path";
import { db } from "./client.js";
import { seed } from "./seed-data.js";

export async function ensureDatabase(): Promise<"ready" | "created"> {
  const [row] = await db.all<{ n: number }>(
    sql`select count(*) as n from sqlite_master where type = 'table' and name = 'users'`
  );
  if (row && row.n > 0) return "ready";

  console.log("\n  Empty database — creating the schema and seeding the demo dataset…");
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "server/db/migrations") });
  await seed();
  return "created";
}
