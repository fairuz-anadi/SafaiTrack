# SafaiTrack

**Smart waste collection and route optimization for Dhaka neighbourhoods.**

Municipal waste collection in Dhaka runs on fixed truck schedules that ignore
how full a bin actually is, and on complaints that travel by phone call and are
never logged. SafaiTrack replaces both — without putting a single sensor in a
single bin.

Aligned with **UN SDG 11** (Sustainable Cities and Communities), secondary
**SDG 12**.

### Why sensor-free

A bin that reports its own fill level is the obvious design and the wrong one
for Dhaka. Three consequences follow from not building it:

| | |
|---|---|
| **৳0 in sensor hardware** | A per-bin ultrasonic unit plus its connectivity contract is the single largest line in a smart-waste budget, and it recurs. SafaiTrack spends nothing on it, which is why a ward can run this on the software alone. |
| **Nothing to steal or break** | Hardware in an unattended public bin is exposed to theft, vandalism and weather, and every dead unit is a blind spot in the data. There is no device on the street to fail. |
| **Works from a ৳1,500 phone** | Reports arrive by web *and* by SMS/USSD, so a resident with no smartphone and no data plan files the same tracked record as anyone else. Coverage is a function of who lives there, not who owns what. |

Fill data therefore comes from residents reporting, ward officers logging
inspections on their rounds, drivers logging each collection, and a diurnal
simulation standing in for the reading history a deployment would accumulate.
All four write to one table with the source taken from the reporter's role, so
an inspection is never mistaken for a passer-by's estimate — and swapping in
real hardware later is a change of `readingSource`, not a redesign. See
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) for what is measured and what is
modelled.

> Built for IEEE SEU SB presents **REACT 2026** — Project Showcasing (Senior).
> Team: Lab C1 Group 05 — Fairuz Anadi, Easteak Ahmed, Saleh Mahmud Sami.

---

## The loop, in four steps

Every figure below is what the running system actually returns — the numbers
are from one pass over ward 27 on seeded data.

**1. Log.** A resident texts `BIN W27-B001 FULL` from any phone, or an officer
records what they find on a round. The SMS gateway answers with a tracking
reference in both languages:

```
{"ok": true, "complaintCode": "CMP-2087",
 "reply": "SafaiTrack: report CMP-2087 received. Track by replying STATUS CMP-2087. / অভিযোগ গৃহীত হয়েছে।"}
```

**2. Predict.** Each bin's own fill history is fitted by ordinary least squares
and carried forward from the last observation. The projection ships with the
evidence behind it, never as a bare claim:

```
W27-B001   +4.189 %/h   overflow in 0h      confidence 0.786   n=9
W32-B004   +6.112 %/h   overflow in 0.33h   confidence 0.575   n=6
```

> The regression fits a straight line through that bin's readings. It does
> **not** model time of day — the diurnal market-and-meal curve lives in the
> simulation that generates fill data, not in the forecaster that predicts
> overflow. Claiming otherwise is a claim the code will not support.

**3. Optimize.** The engine takes the eligible bins in one ward — already over
threshold, or forecast to cross it inside the lookahead — and builds a tour:
Dijkstra over the ward road graph, priority-weighted nearest neighbour, then
2-opt. It is scored against the fixed schedule it replaces:

```
R-27-84429   7 stops   13.99 km  vs  20.47 km fixed schedule
             −31.66 %   2.46 L fuel   ৳258.55   6.6 kg CO₂
```

**4. Collect.** The driver opens the route on a phone, empties each bin and
logs it. The bin drops to 0% and the stop is marked collected. The reading
trail on that one bin is the whole loop in three rows:

```
simulated   94.4     the diurnal model, standing in for hardware
citizen    100.0     the SMS from step 1
driver       0.0     the collection from step 4
```

---

## What it does

| | |
|---|---|
| **Demand-driven routing** | Dijkstra shortest paths + priority-weighted nearest neighbour + 2-opt. Measured at **~31% shorter** than the fixed schedule it replaces. |
| **Proves its own value** | Every generated route is scored against a fixed-schedule baseline over the same ward, with fuel, BDT and CO₂. The arithmetic is published in [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md). |
| **Predicts overflow** | Ordinary least-squares regression, fitted per bin over its citizen reports, collection logs and simulated history, projects hours-to-overflow with an r² confidence and a sample size — so routes are planned *before* waste hits the street, with no device in the bin. |
| **Citizen-in-the-loop** | Web portal in English and বাংলা, plus an SMS/USSD channel for residents without a smartphone. Every complaint has an append-only, attributable audit trail. |
| **AI operations assistant** | Claude with read-only tool access to the live database — and a deterministic offline advisor that answers the same questions with no internet at all. |
| **Runs a whole day in 20 seconds** | A simulation clock drives the network into crisis on realistic diurnal fill curves, so the system can be seen working rather than described. |

---

## Quick start

```bash
npm install
npm run setup    # creates and seeds data/safaitrack.db
npm run dev      # API on :8080, UI on :5173
```

Open <http://localhost:5173> and sign in with a one-click demo account.

### Demo accounts — password `safai1234` for all

| Role | Email | What they see |
|---|---|---|
| Municipal staff | `staff@safaitrack.gov.bd` | Everything: dashboard, routing, fleet, impact |
| Ward officer | `officer27@safaitrack.gov.bd` | Complaints in their ward only |
| Truck driver | `rafiq@safaitrack.gov.bd` | Their assigned route, mobile-first |
| Citizen | `citizen@example.com` | File and track their own reports |

### Production (single process)

```bash
npm run build
npm start        # serves API + SPA on :8080
```

---

## Offline by design

The competition venue may have no usable internet. Nothing in the demo needs it:

- **Database** — a local SQLite file. No server to install, no migration to run.
- **Database** — if the file is missing, the server creates the schema and seeds
  the demo data itself on first start. A fresh checkout runs with no setup step.
- **AI assistant** — falls back to a local rule-based advisor and says so in the
  UI. Set `OPENAI_API_KEY` (or optionally `ANTHROPIC_API_KEY`) to enable the live
  explainer; leave it unset and the deterministic fallback still works.
- **Map** — Leaflet detects dead OpenStreetMap tiles and keeps rendering exact
  bin positions and route lines without the street artwork.

---

## Try the SMS and WhatsApp channels

Roughly a third of Dhaka residents would not use a smartphone app for civic
reporting. The `POST /api/intake/sms` endpoint accepts a plain text message in
English or Bangla, resolves it to a bin, and files an ordinary complaint — same
record, same audit trail, same tracking reference. `POST /api/intake/whatsapp`
does the same for messages sent to the municipal WhatsApp number, in the
payload shape Meta's Business Cloud API delivers; set the three `WHATSAPP_*`
values in `.env` to connect a real number, and replies go back over WhatsApp.

**For a demo, open <http://localhost:5173/phone>** — a phone on screen. Pick
WhatsApp or SMS, tap a suggested message, and the report lands on the staff
dashboard (which refreshes itself) with its channel tagged. It calls the same
two webhooks; nothing is mocked. On the venue wifi it also works from a real
phone's browser.

```bash
curl -X POST http://localhost:8080/api/intake/sms -H "Content-Type: application/json" -d "{\"from\":\"01911000000\",\"text\":\"BIN W27-B001 FULL\",\"channel\":\"sms\"}"
```

Bangla free text works too, resolving to the nearest bin in the sender's ward:

```bash
curl -X POST http://localhost:8080/api/intake/sms -H "Content-Type: application/json" -d "{\"from\":\"01911000002\",\"text\":\"ময়লা উপচে পড়ছে\",\"channel\":\"ussd\"}"
```

---

## Stack

**Frontend** React 19 · Vite 6 · TypeScript · wouter · Leaflet · Recharts ·
a hand-written CSS design system (no component library)

**Backend** Hono · Drizzle ORM · libSQL/SQLite · Zod · jose (JWT) · bcrypt

**AI** `@anthropic-ai/sdk` — `claude-opus-5` with adaptive thinking and a
seven-tool read-only surface over the database

**Routing** Custom TypeScript. No optimization library — the algorithm is meant
to be read.

---

## Project layout

```
client/src/
  components/   layout · map · agent · SimulationBar
  pages/        Landing · Login · Register · Report · MyReports
                Dashboard · Bins · Routes · RouteDetail · Impact
                Complaints · Fleet · Analytics · DriverRoute · Phone
  lib/          api · auth · i18n · format
  index.css     the design system

server/
  db/           schema.ts (18 entities + 5 extensions) · seed-data.ts · bootstrap.ts · migrations/
  services/     routing · forecast · impact · simulation
  routes/       auth · bins · routes · complaints · whatsapp · analytics · agent
  ai/           agent.ts (Claude + offline) · tools.ts
  middleware/   auth.ts (RBAC)

shared/         types.ts · schemas.ts — used by both sides
docs/           METHODOLOGY.md
context.md      full project context, decisions, status, demo script
```

---

## Configuration

Everything has a working default; the app runs with **no `.env` file at all**.
Copy `.env.example` to `.env` to change anything.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./data/safaitrack.db` | Or a `libsql://…` Turso URL |
| `DATABASE_AUTH_TOKEN` | — | Turso only |
| `JWT_SECRET` | dev fallback | **Change before deploying** |
| `PORT` | `8080` | |
| `LLM_PROVIDER` | `openai` | `openai`, `anthropic`, or `none` |
| `OPENAI_API_KEY` | — | Primary LLM provider key |
| `OPENAI_MODEL` | `gpt-4o-mini` | |
| `ANTHROPIC_API_KEY` | — | Optional secondary provider key |
| `ANTHROPIC_MODEL` | `claude-opus-5` | |

---

## Honest limitations

Documented in full in [`context.md`](context.md) §9 and
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) §9. In short: road distance uses a
1.35 detour factor rather than routed geometry; the SMS endpoint is real but
has no paid gateway behind it; photo upload is a schema field without object
storage; and the ~31% figure is a *simulation* result — published field
deployments of this technique average closer to 12%.

---

## Documentation

- [`context.md`](context.md) — decisions, architecture, status, and the
  five-minute demo script
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — every constant and every
  formula behind the savings numbers
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — step-by-step hosting guide
