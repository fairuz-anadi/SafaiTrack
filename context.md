# SafaiTrack — Project Context

The single source of truth for what this project is, what has been built, why
each decision was made, and what is left. Read this first.

**Last updated:** 7 September 2026
**Competition:** IEEE SEU SB presents REACT 2026 — Project Showcasing (Senior)
**Event:** 10 September 2026, Southeast University, Dhaka
**Team:** Lab Section C1, Group 05 — Fairuz Anadi (20230104121), Easteak Ahmed
(20230104123), Saleh Mahmud Sami (20220204061)
**Course origin:** CSE 3200 Software Development V
**SDG alignment:** SDG 11 (primary) · SDG 12 (secondary)

---

## 1. What the project is

SafaiTrack is a smart waste-collection and route-optimization system for Dhaka
ward-level solid-waste collection. It replaces three broken things at once:

| Broken today | SafaiTrack |
|---|---|
| Fixed truck schedules that ignore how full a bin actually is | Demand-driven routes generated from live fill levels |
| Complaints travelling by phone call and word of mouth, never logged | A structured, trackable complaint channel with a permanent audit trail |
| No consolidated ward-wide view; routes planned from memory | One operations dashboard with a live map and measured performance |

**The core contribution** is the positioning: commercial platforms (Sensoneo,
Bigbelly) deliver this by putting a sensor in every bin, which is exactly the
cost a Bangladeshi city corporation cannot carry. SafaiTrack keeps the routing
intelligence and drops the hardware bill, while keeping the database schema
hardware-ready for a future sensor retrofit.

---

## 2. Judging criteria and how the build answers each

The rulebook scores 60 points across five weighted criteria. Every major
feature was chosen against this table.

| Criterion | Pts | What answers it |
|---|---|---|
| Real-life Applications | 20 | Real DNCC ward numbers and real Dhaka coordinates; Amin Bazar as the actual disposal site; four working roles; the SMS/USSD channel for residents without smartphones; Bangla interface |
| Technical Innovation & Creativity | 10 | Dijkstra + priority-weighted nearest-neighbour + 2-opt routing; per-bin OLS fill-rate regression predicting overflow hours in advance; an AI assistant with real tool access to the database |
| Uniqueness | 10 | The measured baseline-vs-optimized comparison — the system scores itself against the schedule it replaces on every single route, and shows the arithmetic |
| Cost Efficiency & Feasibility | 10 | Zero per-bin hardware; runs offline from one SQLite file on one laptop; free-tier deployable; savings quoted in BDT with stated constants |
| Presentation & Video | 10 | The simulation clock — "Run a full day" drives the network into crisis in ~20 seconds, then the optimizer answers it live in front of the judges |

---

## 3. Decisions taken, and why

These were confirmed with the project owner before building.

1. **Stack: full TypeScript, not ASP.NET Core.** The proposal committed to
   ASP.NET Core + SQL Server, but this codebase is *not* being submitted for
   the CSE 3200 lab — it is the competition entry. A single-language stack
   ships faster, deploys free, and runs offline on a laptop with one command.
   *If the lab submission later needs C#, the schema and the routing algorithm
   port directly; only the HTTP layer would be rewritten.*

2. **Offline-first with a graceful map fallback.** Venue wifi was described as
   "hotspot, but flaky". The database is a local SQLite file; the AI assistant
   falls back to a deterministic local advisor with no network; the Leaflet map
   detects dead tiles and keeps rendering exact bin positions without street
   artwork. Nothing in the demo requires the internet.

3. **Real Dhaka geography.** Actual DNCC ward numbers (16, 19, 27, 32), real
   lat/lng on real roads, and the Amin Bazar landfill as the disposal point. A
   Dhaka judge should recognise every landmark.

4. **Five extensions beyond the proposal** (all built): baseline-vs-optimized
   proof, live simulation clock, predictive overflow forecast, Bangla + SMS/USSD
   channel, and the AI operations assistant.

---

## 4. Architecture

```
Browser (React 19 + Vite + TypeScript)
   │  fetch /api/*   — JWT in an httpOnly cookie, Bearer fallback
   ▼
Hono API (Node 20+)
   ├── routes/     auth · bins · routes · complaints · analytics · agent
   ├── services/   routing · forecast · impact · simulation
   ├── ai/         Claude tool-runner  ⇄  offline rule-based advisor
   └── db/         Drizzle ORM
   ▼
libSQL / SQLite
   local file (offline demo)  ·or·  hosted Turso (cloud) — same schema
```

In production the Hono server also serves the built SPA from `dist/public`, so
the whole system is **one process** — one thing to start at the venue, one
thing to deploy.

### Why these choices

- **Hono** over Express: smaller, faster, first-class TypeScript, and it runs
  unchanged on Node, Bun, or an edge runtime if hosting ever changes.
- **Drizzle + libSQL** over Prisma + Postgres: one SQL dialect covers both the
  offline file and the hosted database, so there is no "works locally, breaks
  in the cloud" gap. No migration engine needs to run at the venue.
- **wouter** over React Router: ~1 kB, and the routing needs here are trivial.
- **No component library.** The design system in `client/src/index.css` is
  hand-written CSS. shadcn/Radix were removed once nothing imported them.

---

## 5. Database schema

`server/db/schema.ts`. The 18 entities from the proposal's ER diagram, in the
same four logical groups, plus five extension tables.

**Group 1 — Identity & ISA (total, disjoint):** `users` supertype with
`citizens`, `municipal_staff`, `truck_drivers`, `ward_officers` subtypes.

**Group 2 — City, bin & sensor data:** `wards`, `collection_zones` (weak,
`ward_id`+`zone_no`), `waste_categories`, `bins`, `bin_sensor_readings` (weak,
`bin_id`+`reading_no`).

**Group 3 — Fleet, routing & collection:** `trucks`, `truck_maintenance_logs`,
`routes`, `route_stops` (weak, `route_id`+`bin_id`), `collection_history`.

**Group 4 — Complaints & alerts:** `complaints` (XOR: targets exactly one bin
*or* one ward), `complaint_status_history` (weak, append-only),
`notifications`.

**Extensions:** `simulation_state` (singleton clock), `route_comparisons`
(baseline scoring), `bin_forecasts` (overflow predictions),
`agent_conversations`, `agent_messages`.

The critical design point for the viva: **`bin_sensor_readings` is modelled
exactly as a real ultrasonic feed** — timestamped readings with a
`reading_source` and a validity flag. Simulated data, citizen reports, and real
hardware are interchangeable inputs. A sensor retrofit changes one enum value,
not the schema.

---

## 6. The routing engine

`server/services/routing.ts`. Deliberately dependency-free and readable,
because it is the part a judge is most likely to ask to see.

1. **Build the graph.** Nodes are the depot, the candidate bins, and the
   disposal site. Edge weight is haversine distance × a **1.35 road-detour
   factor** — Dhaka's street grid is not crow-flies, and inflating the honest
   number would be the easiest place to cheat.
2. **Dijkstra** from every node gives an all-pairs shortest-path matrix. On a
   complete graph the direct edge wins, but `blockedPairs` can remove edges for
   closed or flooded roads — and then the cheapest A→B path genuinely runs
   through C. That is what makes the matrix a road-network cost, not a ruler.
3. **Priority-weighted nearest neighbour** constructs the tour. Cost is
   `distance / (1 + (fill/100)² × 0.9)`, so a 95%-full bin pulls forward
   without abandoning distance as the dominant term.
4. **2-opt** reverses tour segments while that shortens the route. Typically
   recovers a further 5–12% over raw nearest-neighbour.

**The baseline it is scored against** is a fixed-schedule route that visits
*every* active bin in the ward in static bin-code order — how a paper route
sheet is actually written, by location number rather than by need.

**Measured result:** ~31% shorter than the baseline on the seeded Dhanmondi
data. The literature meta-analysis cited in the proposal reports a 21.5% pooled
mean, with simulation studies at 20–40% — this lands inside that band, which is
the honest place to be.

---

## 7. Overflow forecasting

`server/services/forecast.ts`. Ordinary least-squares regression of fill % on
elapsed hours, fitted **per bin** over its recent readings.

- Collection events (a drop of >25 points) end a segment, so emptying a bin
  does not drag its slope negative.
- Confidence blends R² with sample size — a perfect line through 3 points is
  less trustworthy than a good line through 20, and the UI shows both.
- A non-positive slope declines to predict rather than inventing a number.

This is what makes routing **proactive**: `POST /api/routes/generate` accepts a
`lookaheadHours` window and pulls in bins forecast to overflow inside it, not
only bins already full.

---

## 8. The AI assistant

`server/ai/agent.ts` + `server/ai/tools.ts`. Two engines behind one interface:

- **Claude** (`claude-opus-5`, adaptive thinking, tool runner) with seven
  read-only tools over the live database: `list_wards`, `get_bins`,
  `get_overflow_forecast`, `get_complaints`, `get_impact_summary`,
  `get_fleet_status`, `propose_route`. It chains queries and reasons over real
  rows, not a summary pasted into the prompt.
- **Offline advisor** — deterministic intent matching answering the same core
  questions straight from SQL, with no network at all.

Two deliberate constraints:

- **The assistant cannot write.** No truck assignment, no complaint status
  change, no messaging citizens. `propose_route` is an explicit dry run. Those
  actions stay with an accountable human, which is the entire point of the
  audit trail.
- **The UI always says which engine answered**, and lists the tools each answer
  actually called. Nothing is passed off as more than it is.

Without `ANTHROPIC_API_KEY` the app runs the offline advisor and says so. The
demo never depends on the venue's wifi.

---

## 9. Current status

### Built and verified working

- [x] 18-entity schema + 5 extension tables, pushed and seeded
- [x] Seed: 32 bins across 4 real DNCC wards, 14 users, 5 trucks, 7-day
      reading history, complaints with full audit trails
- [x] Auth: registration, login, JWT sessions, role-based route guards
- [x] Citizen: bilingual report portal, my-reports with live audit trail
- [x] Staff: dashboard, live Leaflet map, bins inventory, route generator,
      route detail with both routes drawn, fleet, analytics, impact proof
- [x] Ward officer: ward-scoped complaint desk with enforced status transitions
- [x] Driver: mobile-first route execution, collection logging, auto-complete
- [x] Routing engine: Dijkstra + NN + 2-opt, measured at ~31% saving
- [x] Overflow forecasting with confidence scores
- [x] Simulation clock: tick / skip 6h / run a full day / reset
- [x] SMS + USSD intake webhook, English and Bangla keyword parsing
- [x] AI assistant with Claude tool-use and offline fallback
- [x] Bilingual UI (EN / বাংলা) across the **entire** product — 413 keys covering
      navigation, dashboards, tables, empty states and error copy, with a
      Bengali webfont and script-specific line heights
- [x] Two-step sign-in: role picker (keyboard 1–4) → credentials, with the
      side panel and demo account following the chosen role
- [x] Ambient bin-network canvas — nodes fill and recolour like real bins,
      cursor pushes them aside, click runs a collection sweep that empties them
- [x] New pages: /about (the problem + comparison table + SDG),
      /bins/:id (reading history chart + map), /settings (language + build info)
- [x] Production build: `vite build` + `esbuild` → single Node process

### Known gaps and honest limitations

- **Photo upload is a filename field, not real object storage.** The complaint
  schema has `photo_path`; nothing writes a file. Wiring it needs a storage
  bucket, which is out of scope for an offline-first demo.
- **The SMS webhook has no real gateway behind it.** The endpoint is real and
  works; connecting it to an aggregator needs a paid shortcode. Demo it with
  `curl` (see README) — that is an honest demonstration of the channel.
- **The road-detour factor is a constant, not routed geometry.** Real road
  distances would need an OSRM instance; 1.35 is a documented, conservative
  stand-in and `docs/METHODOLOGY.md` says so.
- **Simulation is not a queueing model.** Bins fill on learned rates with a
  diurnal curve and noise. It reproduces plausible operational data, not
  household-level waste generation.
- **No automated test suite.** Verified manually end to end through the browser
  and the API. Given three days to the event, working features were prioritised
  over test coverage — this is a deliberate trade, not an oversight.
- **The bundle is ~905 kB** (recharts + leaflet). Fine over localhost; would
  benefit from code-splitting before any real deployment at scale.

---

## 10. Demo script for judging day (5 minutes)

1. **Landing page** (15s) — the problem and the positioning. Numbers on the
   outcome strip are live from the API, not typed in.
2. **Sign in as Municipal staff** (one click on the demo account card).
3. **Run a full day** (20s) — the simulation clock advances 24 in-world hours.
   Critical bins go from ~8 to ~26; the map turns red. *"This is what a fixed
   schedule produces."*
4. **Optimize worst ward** (10s) — lands on the route detail. The banner reads
   **~31% shorter**, with fuel, BDT and CO₂. Toggle the baseline line so both
   routes are drawn on the real Dhaka map at once.
5. **Impact page** (45s) — every scored route, plus the methodology panel with
   every constant stated. *"You can check our arithmetic."*
6. **Ask the assistant** "What needs my attention right now?" (20s) — it reads
   the live database and lists the tools it queried.
7. **Switch to the driver phone view** (30s) — Bangla landmarks, tap Collected,
   the bin empties in real time.
8. **Citizen report + SMS** (40s) — file a report in Bangla, show it appear on
   the officer's desk with an append-only audit trail. Then `curl` the SMS
   endpoint to show the no-smartphone path.

Close on the SDG 11 line and the cost argument: *no hardware, runs on a laptop,
saves a third of the distance.*

---

## 11. Demo accounts

Password for all: `safai1234`

| Role | Email |
|---|---|
| Municipal staff | `staff@safaitrack.gov.bd` |
| Ward officer (Dhanmondi) | `officer27@safaitrack.gov.bd` |
| Truck driver | `rafiq@safaitrack.gov.bd` |
| Citizen | `citizen@example.com` |

---

## 12. Commands

```bash
npm install          # once
npm run setup        # drop, recreate and seed the database
npm run dev          # API :8080 + Vite :5173, both hot-reloading
npm run build        # SPA + server bundle into dist/
npm start            # single production process on :8080
npm run check        # TypeScript, no emit
```

**Before the judges arrive:** run `npm run setup` for a clean, predictable
starting picture.
