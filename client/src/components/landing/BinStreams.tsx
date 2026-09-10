/**
 * "Which bin does it go in" — the segregation section.
 *
 * Every other landing section explains what the software does. This one is
 * about the thing on the footpath, because segregation is where a collection
 * system either works or does not: a route that arrives on time at a bin
 * holding mixed waste has still lost the recyclable and composted the plastic.
 *
 * The four streams, their colours, their Bangla names and their handling notes
 * are read from `/waste-categories` — they are rows in the database, the same
 * rows the bin inventory joins against, so the card colours here and the pin
 * colours on the operations map cannot drift apart. The bin count on each card
 * is live.
 *
 * Each card carries a photograph slot. Until a real photo is dropped into
 * `client/public/images/`, it draws the bin in that stream's own colour, so
 * the section is complete with no assets at all.
 */
import { useEffect, useState } from "react";
import { Figure } from "@/components/media/Figure";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Category {
  wasteCategoryId: number;
  categoryName: string;
  categoryNameBn: string | null;
  handlingNotes: string | null;
  isHazardous: boolean;
  colorHex: string;
  /** Absent on an older API build; the count line simply does not render. */
  binCount?: number;
  avgFill?: number;
}

/**
 * Photograph filename per stream, resolved by the stream's database name.
 *
 * Keyed on `categoryName` rather than on the row id because ids are assigned
 * by insertion order at seed time and would silently re-point every photo if
 * the seed list were ever reordered.
 */
const PHOTO: Record<string, string> = {
  "General waste": "bin-general.jpg",
  "Organic waste": "bin-organic.jpg",
  Recyclable: "bin-recyclable.jpg",
  "Medical waste": "bin-medical.jpg",
};

export function BinStreams() {
  const { t, tn, lang } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ categories: Category[] }>("/waste-categories")
      .then(r => {
        if (!cancelled) setCategories(r.categories);
      })
      .catch(() => {
        /* the section is additive — a failure just leaves it out */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (categories.length === 0) return null;

  return (
    <section className="streams-section reveal" id="bins">
      <div className="streams-head">
        <p className="public-kicker">{t("streams.kicker")}</p>
        <h2>
          {t("streams.title1")} <em>{t("streams.title2")}</em>
        </h2>
        <p>{t("streams.body")}</p>
      </div>

      <div className="streams-grid reveal-stagger">
        {categories.map((c, i) => {
          const name = lang === "bn" && c.categoryNameBn ? c.categoryNameBn : c.categoryName;
          return (
            <article
              className={`stream-card lift ${c.isHazardous ? "hazardous" : ""}`}
              key={c.wasteCategoryId}
              style={{ "--stream": c.colorHex, "--i": i } as React.CSSProperties}
            >
              <Figure
                scene="bin"
                tint={c.colorHex}
                src={PHOTO[c.categoryName]}
                alt={t("streams.photoAlt", { stream: name })}
                className="stream-figure"
              />

              <div className="stream-body">
                <span className="stream-swatch" aria-hidden="true" />
                <strong>{name}</strong>
                {/* The Latin name stays visible in Bangla: the bin stencils and
                    the ward paperwork are both in English. */}
                {lang === "bn" && c.categoryNameBn && <small>{c.categoryName}</small>}
                {c.handlingNotes && <p>{c.handlingNotes}</p>}

                {typeof c.binCount === "number" && (
                  <div className="stream-meta">
                    <span>
                      <b>{c.binCount}</b> {tn(c.binCount, "common.binOne", "common.bins")}
                    </span>
                    {typeof c.avgFill === "number" && c.binCount > 0 && (
                      <span>
                        <b>{c.avgFill}%</b> {t("streams.avgFill")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {c.isHazardous && <span className="stream-flag">{t("streams.hazardous")}</span>}
            </article>
          );
        })}
      </div>

      {/* The recyclable stream is the one that does not end at a landfill, and
          in Dhaka the sorting is done by people rather than machines. The
          section would be dishonest if it stopped at the four bins. */}
      <div className="streams-outro">
        <Figure
          scene="sorting"
          src="sorting-yard.jpg"
          alt={t("streams.yardAlt")}
          className="streams-yard"
        />
        <div>
          <p className="public-kicker">{t("streams.yardKicker")}</p>
          <h3>{t("streams.yardTitle")}</h3>
          <p>{t("streams.yardBody")}</p>
        </div>
      </div>

      <p className="streams-note">{t("streams.note")}</p>
    </section>
  );
}
