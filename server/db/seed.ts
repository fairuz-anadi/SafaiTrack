/**
 * `npm run db:seed` — rebuild the demo dataset in whatever DATABASE_URL
 * points at. The seed itself lives in seed-data.ts so the server can also
 * run it on first start against an empty database.
 */
import { seed } from "./seed-data.js";

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
