/**
 * SafaiTrack API server.
 *
 * In development this serves only /api (Vite serves the client and proxies
 * here). In production it also serves the built SPA from dist/public, so the
 * whole system is one `node dist/server/index.js` process — one thing to
 * start at the venue, and one thing to deploy.
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentRoutes } from "./routes/agent.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { authRoutes } from "./routes/auth.js";
import { binRoutes } from "./routes/bins.js";
import { complaintRoutes } from "./routes/complaints.js";
import { routeRoutes } from "./routes/routes.js";
import type { AppEnv } from "./middleware/auth.js";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  })
);

/* ────────────────────────────────  API  ────────────────────────────────── */

const api = new Hono<AppEnv>();

api.get("/health", c =>
  c.json({
    ok: true,
    service: "safaitrack",
    time: new Date().toISOString(),
    database: (process.env.DATABASE_URL ?? "file:./data/safaitrack.db").startsWith("file:")
      ? "local-sqlite"
      : "remote-libsql",
  })
);

api.route("/auth", authRoutes);
api.route("/", binRoutes);
api.route("/", routeRoutes);
api.route("/", complaintRoutes);
api.route("/", analyticsRoutes);
api.route("/", agentRoutes);

app.route("/api", api);

/* ─────────────────────────  ERROR NORMALISATION  ──────────────────────── */

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[unhandled]", err);
  return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
});

app.notFound(c => {
  if (c.req.path.startsWith("/api")) {
    return c.json({ error: `No API route matches ${c.req.method} ${c.req.path}` }, 404);
  }
  return c.text("Not found", 404);
});

/* ───────────────────────  STATIC SPA (production)  ─────────────────────── */

const publicDir = resolve(process.cwd(), "dist/public");
if (existsSync(publicDir)) {
  app.use("/assets/*", serveStatic({ root: "./dist/public" }));
  app.use("/*", serveStatic({ root: "./dist/public" }));
  // Client-side routing: anything not matched above returns the SPA shell.
  //
  // Except a request that is plainly for a file. A missing photograph used to
  // come back as the SPA shell with a 200, so the browser downloaded a page of
  // HTML, tried to decode it as a JPEG, and only then fired `error` — which is
  // why an empty image slot flashed a broken-image icon before its fallback
  // illustration appeared. A path with a file extension is never a client
  // route, so it gets an honest 404 and the failure is immediate.
  const ASSET_PATH = /\.[a-z0-9]{2,5}$/i;
  const indexHtml = resolve(publicDir, "index.html");
  app.get("*", c => {
    const path = c.req.path;
    if (path.startsWith("/api")) return c.json({ error: "Not found" }, 404);
    if (ASSET_PATH.test(path)) return c.text("Not found", 404);
    return c.html(readFileSync(indexHtml, "utf-8"));
  });
}

const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port }, info => {
  const mode = existsSync(publicDir) ? "production (serving SPA)" : "development (API only)";
  console.log(`\n  SafaiTrack API — ${mode}`);
  console.log(`  http://localhost:${info.port}/api/health`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`  AI assistant: offline advisor (no ANTHROPIC_API_KEY set)`);
  } else {
    console.log(`  AI assistant: ${process.env.ANTHROPIC_MODEL ?? "claude-opus-5"}`);
  }
  console.log("");
});

export default app;
