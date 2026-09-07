import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./data/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/safaitrack.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  verbose: true,
});
