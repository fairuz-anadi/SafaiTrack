# Photographs

Drop image files in this folder and they appear on the landing page. Until
then, each slot renders an original illustration, so the site is never broken
by a missing file.

## Filenames the site looks for

### "On the ground" — the four moments of a collection cycle

| File | Slot |
|---|---|
| `bin-overflow.jpg` | An overflowing bin on a Dhaka street |
| `citizen-report.jpg` | Someone reporting a bin on a phone |
| `truck-route.jpg` | A collection truck working a route |
| `bin-collected.jpg` | The same spot after collection |

### "Four streams, four bins" — the segregation section

One photograph per waste stream. The stream a file belongs to is decided by
the `categoryName` in the `waste_categories` table, not by the file itself, so
these four names are fixed:

| File | Stream |
|---|---|
| `bin-general.jpg` | General waste — the green stream |
| `bin-organic.jpg` | Organic waste — kitchen and market waste |
| `bin-recyclable.jpg` | Recyclable — paper, plastic, metal |
| `bin-medical.jpg` | Medical waste — hazardous, licensed handlers only |
| `sorting-yard.jpg` | The sorting yard where the recyclable stream ends |

Every filename above is already wired up. Drop a file in with the right name
and it appears on the next reload; no code change is needed. Until then the
slot draws its own illustration, which for the stream cards is a bin in that
stream's database colour.

## Use your own photographs

Take these yourself. Four phone photos of real bins near your ward beat any
stock image, and they are the single cheapest way to earn the *Real-life
Applications* marks — a judge in Dhaka can tell the difference between a
street they recognise and a stock photo of a European recycling bin.

**Do not use images from a Google Image search.** The competition rulebook
lists copied material as a disqualification criterion, and most search results
are copyrighted regardless of where they are hosted.

If you genuinely cannot photograph a scene, these libraries are free for
commercial use with no attribution required — download the file and commit it
here rather than hotlinking, so the demo still works offline:

- <https://unsplash.com> — search "waste collection", "garbage truck", "dhaka street"
- <https://pexels.com> — same searches
- <https://openverse.org> — filter to CC0 / public domain

Record where each file came from in `CREDITS.md` next to this file.

## Format

- **JPG** for photographs, **PNG** only when transparency is needed
- Resize the long edge to about **1600px** before committing — a 6MB phone
  photo will make the page crawl on venue wifi
- Aim for under 400KB each
