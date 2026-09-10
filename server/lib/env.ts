import { existsSync } from "node:fs";

// Node 20.12+ loads the backend environment; Vite's envDir only covers Vite.
if (existsSync(".env")) {
  if (!process.loadEnvFile) throw new Error("Loading .env requires Node 20.12 or newer");
  process.loadEnvFile(".env");
}
