/**
 * The problem, the gap, and where SafaiTrack sits — a public page.
 *
 * The proposal's argument lives in a PDF nobody at a competition will read.
 * This puts the same case on screen, with the comparison table that makes the
 * positioning legible in about fifteen seconds.
 */
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleCheck,
  Recycle,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { BrandLockup, BrandMark, Wordmark } from "@/components/brand/Brand";
import { useRevealOnScroll } from "@/hooks/useMotion";
import { LanguageToggle, useI18n } from "@/lib/i18n";

interface Row {
  labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0];
  global: { en: string; bn: string };
  dhaka: { en: string; bn: string };
  ours: { en: string; bn: string };
}

const COMPARISON: Row[] = [
  {
    labelKey: "about.rowData",
    global: { en: "Per-bin ultrasonic sensors", bn: "প্রতি বিনে আল্ট্রাসনিক সেন্সর" },
    dhaka: { en: "None — no fill tracking", bn: "কিছু নেই — ভরাট ট্র্যাকিং নেই" },
    ours: { en: "Simulated + citizen-reported", bn: "সিমুলেটেড + নাগরিকের রিপোর্ট" },
  },
  {
    labelKey: "about.rowRoute",
    global: { en: "Automated, sensor-driven", bn: "স্বয়ংক্রিয়, সেন্সরভিত্তিক" },
    dhaka: { en: "Fixed, manual, schedule-based", bn: "নির্ধারিত, ম্যানুয়াল, সূচিভিত্তিক" },
    ours: { en: "Automated, demand-driven", bn: "স্বয়ংক্রিয়, চাহিদাভিত্তিক" },
  },
  {
    labelKey: "about.rowCost",
    global: { en: "High — hardware + connectivity", bn: "উচ্চ — যন্ত্র ও সংযোগ" },
    dhaka: { en: "Low, but no coordination", bn: "কম, কিন্তু সমন্বয় নেই" },
    ours: { en: "Low — software only", bn: "কম — শুধু সফটওয়্যার" },
  },
  {
    labelKey: "about.rowCitizen",
    global: { en: "Minimal — operations-facing", bn: "সামান্য — শুধু কার্যক্রমমুখী" },
    dhaka: { en: "Informal calls, untracked", bn: "অনানুষ্ঠানিক ফোন, ট্র্যাক হয় না" },
    ours: { en: "Trackable web + SMS + USSD", bn: "ট্র্যাকযোগ্য ওয়েব + SMS + USSD" },
  },
  {
    labelKey: "about.rowUpgrade",
    global: { en: "Already hardware-native", bn: "আগে থেকেই যন্ত্রনির্ভর" },
    dhaka: { en: "Would need a full retrofit", bn: "সম্পূর্ণ নতুন করে বসাতে হবে" },
    ours: { en: "Sensor-ready schema by design", bn: "সেন্সরের জন্য প্রস্তুত স্কিমা" },
  },
];

const FACTS = [
  {
    icon: Trash2,
    value: "25,000",
    unitEn: "tonnes / day",
    unitBn: "টন / দিন",
    bodyEn: "Solid waste generated across Bangladesh's major cities, with Dhaka the largest share.",
    bodyBn: "বাংলাদেশের বড় শহরগুলোতে দৈনিক কঠিন বর্জ্য, যার সবচেয়ে বড় অংশ ঢাকার।",
    tone: "coral",
  },
  {
    icon: Building2,
    value: "1983",
    unitEn: "first ordinance",
    unitBn: "প্রথম অধ্যাদেশ",
    bodyEn: "Four decades of policy since the Dhaka City Corporation Ordinance — implementation still lags the paperwork.",
    bodyBn: "ঢাকা সিটি কর্পোরেশন অধ্যাদেশের পর চার দশকের নীতি — বাস্তবায়ন এখনো পিছিয়ে।",
    tone: "amber",
  },
  {
    icon: TrendingDown,
    value: "21.5%",
    unitEn: "pooled reduction",
    unitBn: "গড় হ্রাস",
    bodyEn: "Average collection-distance saving reported across studies of route optimization.",
    bodyBn: "রুট অপটিমাইজেশন গবেষণায় প্রাপ্ত গড় দূরত্ব সাশ্রয়।",
    tone: "lime",
  },
  {
    icon: Recycle,
    value: "SDG 11",
    unitEn: "primary alignment",
    unitBn: "প্রধান সংযোগ",
    bodyEn: "Sustainable Cities and Communities, with a secondary contribution to SDG 12.",
    bodyBn: "টেকসই নগর ও জনপদ, SDG ১২-তেও অবদান।",
    tone: "blue",
  },
];

export default function About() {
  const { t, lang } = useI18n();
  const revealRef = useRevealOnScroll<HTMLDivElement>();

  return (
    <div className="public-site is-ready" ref={revealRef}>
      <header className="public-nav">
        <Link href="/" className="public-brand">
          <BrandLockup size={34} />
        </Link>
        <div className="public-nav-actions">
          <LanguageToggle compact />
          <Link href="/" className="back-link">
            <ArrowLeft size={15} /> {t("common.back")}
          </Link>
        </div>
      </header>

      <main>
        <section className="about-hero ambient-host">
          <AmbientNetwork className="feather" intensity={0.55} density={0.7} showTruck={false} />
          <p className="public-kicker">{t("about.kicker")}</p>
          <h1>
            {t("about.title1")}
            <br />
            <em>{t("about.title2")}</em>
          </h1>
          <p className="about-lead">{t("about.lead")}</p>
        </section>

        <section className="about-facts reveal reveal-stagger">
          {FACTS.map((f, i) => (
            <div className="fact-card glow lift" key={f.value} style={{ "--i": i } as React.CSSProperties}>
              <div className={`stat-icon ${f.tone}`}>
                <f.icon size={18} strokeWidth={2.2} />
              </div>
              <strong>{f.value}</strong>
              <span>{lang === "bn" ? f.unitBn : f.unitEn}</span>
              <p>{lang === "bn" ? f.bodyBn : f.bodyEn}</p>
            </div>
          ))}
        </section>

        <section className="about-gap reveal">
          <div className="about-gap-copy">
            <p className="public-kicker">{t("about.gapKicker")}</p>
            <h2>{t("about.gapTitle")}</h2>
            <p>{t("about.gapBody")}</p>
          </div>

          <div className="table-scroll">
            <table className="data-table compare-table">
              <thead>
                <tr>
                  <th />
                  <th>{t("about.colGlobal")}</th>
                  <th>{t("about.colDhaka")}</th>
                  <th className="ours">{t("about.colOurs")}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.labelKey}>
                    <td>
                      <b>{t(row.labelKey)}</b>
                    </td>
                    <td>{row.global[lang]}</td>
                    <td>{row.dhaka[lang]}</td>
                    <td className="ours">{row.ours[lang]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="about-sdg reveal">
          <div className="sdg-mark">11</div>
          <div>
            <p className="public-kicker">{t("about.sdgTitle")}</p>
            <p className="sdg-body">{t("about.sdgBody")}</p>
            <div className="check-list" style={{ marginTop: 18 }}>
              <span>
                <CircleCheck size={16} /> {t("cities.check1")}
              </span>
              <span>
                <CircleCheck size={16} /> {t("cities.check3")}
              </span>
            </div>
          </div>
        </section>

        <section className="final-cta reveal">
          <p className="public-kicker">{t("final.kicker")}</p>
          <h2>
            {t("hero.title1")} <em>{t("hero.title2")}</em>
          </h2>
          <div className="hero-buttons" style={{ justifyContent: "center" }}>
            <Link href="/login" className="public-primary">
              {t("hero.cta")} <ArrowRight size={16} />
            </Link>
            <Link href="/report" className="light-button">
              {t("nav.report")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div>
          <BrandMark size={26} />
          <Wordmark size={14} />
        </div>
        <span>{t("footer.tagline")}</span>
        <Link href="/team" className="footer-link">
          {t("nav.team")}
        </Link>
        <span>{t("footer.sdg")}</span>
      </footer>
    </div>
  );
}
