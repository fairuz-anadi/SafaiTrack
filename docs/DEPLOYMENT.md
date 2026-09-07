# Deployment — where to put SafaiTrack, in easy steps

Two things matter here, and they are different problems:

- **A public URL** you can put on a poster, a slide, or a QR code.
- **A working laptop demo** that survives dead venue wifi on 10 September.

**Do the laptop first.** It is what you are actually judged on. Treat the
public URL as a bonus.

---

## Part A — The laptop demo (do this first, ~10 minutes)

This is the version that runs at Southeast University. It needs no internet.

### Step 1 — Build it once, at home, on good wifi

```bash
cd "D:\SAFAI TRACK SOUTHEAST"
npm install
npm run build
```

### Step 2 — Reset the data to a clean starting picture

```bash
npm run setup
```

Do this again the morning of the event so the judges see predictable numbers.

### Step 3 — Start it

```bash
npm start
```

Open <http://localhost:8080>. That is the whole system — one process, one port.

### Step 4 — Rehearse the failure case

Turn your wifi **off** and reload the page. You should see:

- The app still loads and every screen still works.
- The map still plots bins and route lines, with an "Offline map" note.
- The AI assistant answers, badged `offline advisor`.

If all three hold, the venue's wifi cannot hurt you.

### Step 5 — Pack a second laptop

Copy the whole folder (including `node_modules` and `data/safaitrack.db`) to a
USB drive and onto a teammate's laptop. Run `npm start` there to confirm. Two
machines that both work is the cheapest insurance you can buy.

> The rulebook says organizers supply **no** power. Bring a full charge, a power
> bank, your own extension cord, and a phone hotspot as a last resort.

---

## Part B — The public URL

### Recommended: Render + Turso (free, ~20 minutes)

This keeps one Node process serving both the API and the UI, exactly like your
laptop.

#### Step 1 — Push to GitHub

```bash
git add -A
git commit -m "SafaiTrack: full system"
git push origin main
```

#### Step 2 — Create a hosted database at [turso.tech](https://turso.tech)

Turso is SQLite in the cloud, so it uses **the same schema and the same code**
as your local file. Nothing changes but a connection string.

1. Sign up (free tier is generous).
2. Create a database named `safaitrack`.
3. Copy the **database URL** (`libsql://safaitrack-you.turso.io`) and create an
   **auth token**. Keep both.

#### Step 3 — Point your local machine at it once, to load the data

Create `.env` with the Turso values, then:

```bash
npm run db:push
npm run db:seed
```

Then **delete or comment out those lines in `.env`** so your laptop demo goes
back to the local file. You do not want the venue demo depending on Turso.

#### Step 4 — Create the Render web service

At [render.com](https://render.com) → **New → Web Service** → connect your repo.

| Field | Value |
|---|---|
| Runtime | Node |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Instance type | Free |

#### Step 5 — Add environment variables in Render

| Key | Value |
|---|---|
| `DATABASE_URL` | your `libsql://…` URL |
| `DATABASE_AUTH_TOKEN` | your Turso token |
| `JWT_SECRET` | a long random string — **generate a new one** |
| `NODE_ENV` | `production` |
| `ANTHROPIC_API_KEY` | *(optional — omit and the offline advisor runs)* |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

#### Step 6 — Deploy and check

Render gives you `https://safaitrack.onrender.com`. Confirm:

```
https://safaitrack.onrender.com/api/health
```

> **Free tier sleeps after 15 minutes idle** and takes ~50 seconds to wake. If
> you put a QR code on your poster, open the URL yourself a minute before
> judging so it is already warm.

### Alternative: Vercel

Works, but the frontend and API deploy as separate concerns and the simulation
clock is awkward on serverless functions. Render's always-one-process model
matches this project better. Use Vercel only if you already know it well.

---

## Part C — Before 10 September

A checklist, in the order that matters.

### Technical

- [ ] `npm run setup` on the demo laptop, the morning of
- [ ] `npm start` and click through the whole 5-minute script in `context.md` §10
- [ ] Rehearse once with wifi **off**
- [ ] Second laptop tested with the same build
- [ ] Power bank charged, own extension cord packed
- [ ] Check the diesel price in `shared/types.ts` still matches reality — if it
      has moved, change `dieselPriceBdtPerLitre` and rebuild

### Presentation (10 of the 60 points)

- [ ] **X-banner or poster.** The rulebook explicitly encourages visual aids for
      software projects, *and says you must bring your own stand.* Put on it:
      the problem in one line, the ~31% figure, the architecture diagram, a QR
      code to the live URL, and the SDG 11 badge.
- [ ] **A short video.** "Presentation and Video Content" is a scored criterion.
      Screen-record the 5-minute demo script with a voiceover. Two minutes is
      plenty.
- [ ] Decide who speaks. One person drives the laptop, one narrates, one handles
      questions. Do not all talk at once.

### Registration and admin

- [ ] Registration form submitted: <https://forms.gle/N3eRZVJSeadv83cw6>
- [ ] Fee paid — ৳1200 non-IEEE / ৳1100 IEEE, bKash or Nagad **Send Money** to
      01642963222, reference `TeamName_PROJECT`
- [ ] Transaction ID saved (required during registration)
- [ ] All three institutional ID cards packed — checked on the day
- [ ] Confirm every member was born after 1 January 1999

---

## Part D — Questions judges will probably ask

Have an answer ready for each. All of these are already handled honestly in the
code and the docs.

**"Is the 31% real, or did you pick it?"**
It is computed. Every route is scored against a fixed-schedule baseline over the
same ward at the same moment. The Impact page states every constant. Published
field deployments average closer to 12% — say that before they do; it makes the
rest of your numbers more credible, not less.

**"Why not use real sensors?"**
Cost is the single most cited barrier in the IoT waste literature, and it is the
reason Dhaka still runs on paper. The `bin_sensor_readings` table is shaped
exactly like a real ultrasonic feed — a retrofit changes one enum value, not the
schema.

**"What if your internet dies?"**
Turn the wifi off and show them. That is the strongest possible answer.

**"Is the AI just a chatbot?"**
No. Show the tool chips under each answer — it queried the live database. Then
point out it has no write access: it can propose a route but cannot dispatch
one, because that stays with an accountable human.

**"What does not work yet?"**
Photo upload has no object storage; the SMS endpoint is real but has no paid
gateway; road distance uses a 1.35 detour factor rather than routed geometry.
Answering this straight is worth more than pretending everything is finished.
