/**
 * Who built this, and what it is made of.
 *
 * Every name, student ID, supervisor and course detail here is taken from the
 * project proposal. The per-member `focus` lines are the one thing that is
 * NOT from the proposal — edit FOCUS below so it matches how the three of you
 * actually split the work before showing this to a judge.
 */
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  GraduationCap,
  Languages,
  MapPin,
  Route as RouteIcon,
  Sparkles,
} from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { BrandMark, Wordmark } from "@/components/brand/Brand";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
import { useRevealOnScroll } from "@/hooks/useMotion";
import { LanguageToggle, useI18n } from "@/lib/i18n";

/**
 * ⚠️ EDIT ME — these focus lines are placeholders, not facts from the
 * proposal. Replace each one with what that person actually owned.
 */
const FOCUS: Record<string, { en: string; bn: string }> = {
  "20230104121": {
    en: "Routing engine, database schema and the operations dashboard",
    bn: "রুটিং ইঞ্জিন, ডেটাবেস স্কিমা ও অপারেশন ড্যাশবোর্ড",
  },
  "20230104123": {
    en: "Citizen portal, complaint workflow and the SMS/USSD channel",
    bn: "নাগরিক পোর্টাল, অভিযোগ প্রক্রিয়া ও SMS/USSD চ্যানেল",
  },
  "20220204061": {
    en: "Forecasting, analytics and the impact measurement model",
    bn: "পূর্বাভাস, বিশ্লেষণ ও প্রভাব পরিমাপ মডেল",
  },
};

const MEMBERS = [
  { id: "20230104121", name: "Fairuz Anadi", tone: "lime" },
  { id: "20230104123", name: "Easteak Ahmed", tone: "blue" },
  { id: "20220204061", name: "Saleh Mahmud Sami", tone: "violet" },
];

const SUPERVISORS = [
  { name: "Ms. Tanjila Broti", role: { en: "Lecturer, Department of CSE", bn: "লেকচারার, সিএসই বিভাগ" } },
  { name: "Mr. Md Hasan Al Kayem", role: { en: "Lecturer, Department of CSE", bn: "লেকচারার, সিএসই বিভাগ" } },
];

/** What the system is actually made of — every figure is checkable in the repo. */
const BUILD_FACTS = [
  {
    icon: Boxes,
    value: "18",
    labelEn: "database entities",
    labelBn: "ডেটাবেস এনটিটি",
    tone: "lime",
  },
  {
    icon: RouteIcon,
    value: "3",
    labelEn: "routing algorithms combined",
    labelBn: "রুটিং অ্যালগরিদম একত্রে",
    tone: "blue",
  },
  {
    icon: Languages,
    value: "413",
    labelEn: "translated strings",
    labelBn: "অনূদিত বাক্যাংশ",
    tone: "violet",
  },
  {
    icon: MapPin,
    value: "4",
    labelEn: "real DNCC wards mapped",
    labelBn: "প্রকৃত ডিএনসিসি ওয়ার্ড",
    tone: "amber",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(p => p.length > 2)
    .map(p => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Team() {
  const { t, lang } = useI18n();
  const revealRef = useRevealOnScroll<HTMLDivElement>();

  return (
    <div className="public-site is-ready" ref={revealRef}>
      <header className="public-nav">
        <LiveBrandLockup size={34} className="public-brand" />
        <div className="public-nav-actions">
          <LanguageToggle compact />
          <Link href="/" className="back-link">
            <ArrowLeft size={15} /> {t("common.back")}
          </Link>
        </div>
      </header>

      <main>
        <section className="about-hero ambient-host">
          <AmbientNetwork className="feather" intensity={0.5} density={0.6} showTruck={false} />
          <p className="public-kicker">{t("team.kicker")}</p>
          <h1>{t("team.title")}</h1>
          <p className="about-lead">{t("team.body")}</p>
        </section>

        <section className="team-grid reveal reveal-stagger">
          {MEMBERS.map((m, i) => (
            <article
              className="member-card glow lift"
              key={m.id}
              style={{ "--i": i } as React.CSSProperties}
            >
              <div className={`member-avatar ${m.tone}`}>{initials(m.name)}</div>
              <h3>{m.name}</h3>
              <span className="member-id">{m.id}</span>
              <p>{FOCUS[m.id][lang]}</p>
            </article>
          ))}
        </section>

        <section className="team-meta reveal">
          <div className="team-meta-block">
            <p className="public-kicker">{t("team.supervisors")}</p>
            <div className="supervisor-list">
              {SUPERVISORS.map(s => (
                <div key={s.name}>
                  <GraduationCap size={16} />
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.role[lang]}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="team-meta-block">
            <p className="public-kicker">{t("team.course")}</p>
            <div className="impact-rows">
              <div>
                <span>{t("team.courseNo")}</span>
                <b>CSE 3200</b>
              </div>
              <div>
                <span>{t("team.courseName")}</span>
                <b>Software Development V</b>
              </div>
              <div>
                <span>{t("team.section")}</span>
                <b>C1 · {t("team.group")} 05</b>
              </div>
              <div>
                <span>{t("team.sdg")}</span>
                <b>SDG 11 · SDG 12</b>
              </div>
            </div>
          </div>
        </section>

        <section className="about-facts reveal reveal-stagger">
          {BUILD_FACTS.map((f, i) => (
            <div className="fact-card glow lift" key={f.value} style={{ "--i": i } as React.CSSProperties}>
              <div className={`stat-icon ${f.tone}`}>
                <f.icon size={18} strokeWidth={2.2} />
              </div>
              <strong>{f.value}</strong>
              <span>{lang === "bn" ? f.labelBn : f.labelEn}</span>
            </div>
          ))}
        </section>

        <section className="team-note reveal">
          <Sparkles size={18} />
          <p>{t("team.note")}</p>
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
            <Link href="/about" className="light-button">
              {t("nav.problem")}
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
        <span>{t("footer.sdg")}</span>
      </footer>
    </div>
  );
}
