import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema.ts",
  // Checked in: the server applies these itself on first start against an
  // empty database (server/db/bootstrap.ts), so a fresh deploy needs no CLI.
  out: "./server/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/safaitrack.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  verbose: true,
});
