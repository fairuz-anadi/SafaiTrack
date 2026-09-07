/**
 * Public landing page.
 *
 * The outcome strip pulls its numbers from the live API rather than hardcoding
 * them, so what a visitor reads is what the system has actually measured.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Bot,
  Building2,
  ChevronDown,
  CircleCheck,
  FileText,
  Gauge,
  MapPin,
  Menu,
  Moon,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Sunset,
  TrendingDown,
  Truck,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { BrandMark, BrandStatement, Wordmark } from "@/components/brand/Brand";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
import { Figure, type SceneName } from "@/components/media/Figure";
import { BinStreams } from "@/components/landing/BinStreams";
import { NewsWire } from "@/components/landing/NewsWire";
import { RouteEngineSection } from "@/components/landing/RouteEngineSection";
import { useRevealOnScroll, usePointerGlow } from "@/hooks/useMotion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { bdt } from "@/lib/format";
import { ROLE_HOME } from "@shared/types";

interface Overview {
  bins: { total: number; critical: number; avgFill: number };
  complaints: { total: number; avgResolutionHours: number };
  routes: { active: number };
  impact: { avgSavedPercent: number; costSavedBdt: number; co2SavedKg: number; routesScored: number };
}

/**
 * The four moments of a collection cycle.
 *
 * Each `src` names the file the slot will use. Until that file exists in
 * `client/public/images/`, `Figure` catches the load error and draws its
 * original illustration instead — so naming them up front costs nothing and
 * the page is never broken by a missing photograph. See that folder's README.
 */
const GALLERY: { scene: SceneName; src?: string; k: string; b: string }[] = [
  { scene: "overflow", src: "bin-overflow.jpg", k: "gallery.g1", b: "gallery.g1b" },
  { scene: "report", src: "citizen-report.jpg", k: "gallery.g2", b: "gallery.g2b" },
  { scene: "route", src: "truck-route.jpg", k: "gallery.g3", b: "gallery.g3b" },
  { scene: "collected", src: "bin-collected.jpg", k: "gallery.g4", b: "gallery.g4b" },
];

export default function Landing() {
  const { user } = useAuth();
  const { t } = useI18n();
  const revealRef = useRevealOnScroll<HTMLDivElement>();
  const glowRef = usePointerGlow<HTMLDivElement>();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [revealed, setRevealed] = useState(false);
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 80);
    api
      .get<Overview>("/analytics/overview")
      .then(setData)
      .catch(() => setData(null));
    return () => window.clearTimeout(timer);
  }, []);

  const outcomes = [
    {
      value: data?.impact.routesScored ? `${data.impact.avgSavedPercent.toFixed(1)}%` : "—",
      label: t("landing.outcome1"),
      copy: t("landing.outcome1sub"),
    },
    {
      value: data ? String(data.bins.total) : "—",
      label: t("landing.outcome2"),
      copy: t("landing.outcome2sub"),
    },
    {
      value: data ? `${data.complaints.avgResolutionHours}h` : "—",
      label: t("landing.outcome3"),
      copy: t("landing.outcome3sub"),
    },
  ];

  const home = user ? ROLE_HOME[user.role] : "/login";

  return (
    <div
      className={`public-site ${revealed ? "is-ready" : ""}`}
      ref={node => {
        revealRef.current = node;
        glowRef.current = node;
      }}
    >
      <header className="public-nav">
        <LiveBrandLockup size={40} className="public-brand" />

        <nav className={`public-links ${mobileOpen ? "open" : ""}`}>
          <Link href="/about" onClick={() => setMobileOpen(false)}>
            {t("nav.problem")}
          </Link>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)}>
            {t("nav.howItWorks")}
          </a>
          <a href="#faq" onClick={() => setMobileOpen(false)}>
            {t("faq.kicker")}
          </a>
          <a href="#impact" onClick={() => setMobileOpen(false)}>
            {t("nav.impact")}
          </a>
          <a href="#for-cities" onClick={() => setMobileOpen(false)}>
            {t("nav.forCities")}
          </a>
          <Link href="/report" onClick={() => setMobileOpen(false)}>
            {t("nav.report")}
          </Link>
        </nav>

        <div className="public-nav-actions">
          <LanguageToggle />
          <Link href={home} className="public-nav-cta">
            {user ? t("nav.dashboard") : t("nav.signIn")} <ArrowRight size={15} />
          </Link>
        </div>

        <button className="public-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <main>
        <section className="landing-hero ambient-host">
          <AmbientNetwork className="feather" intensity={0.95} density={1.1} />
          <div className="hero-noise" />
          <div className="hero-copy-block">
            <div className="hero-eyebrow">
              <span className="public-live-dot" /> {t("hero.eyebrow")}
            </div>
            <h1>
              {t("hero.title1")}
              <br />
              <em>{t("hero.title2")}</em>
            </h1>
            <p>{t("hero.body")}</p>
            <div className="hero-buttons">
              <Link href={home} className="public-primary">
                {t("hero.cta")} <ArrowRight size={16} />
              </Link>
              <Link href="/report" className="play-button">
                <span>
                  <FileText size={13} />
                </span>{" "}
                {t("nav.report")}
              </Link>
            </div>
            <p className="ambient-hint">
              <b>{t("hero.hint")}</b> {t("hero.hintRest")}
            </p>
            <div className="hero-trust">
              <div className="mini-avatars">
                <span>FA</span>
                <span>EA</span>
                <span>SM</span>
                <b>+</b>
              </div>
              <span>{t("hero.trust")}</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="ambient-chip chip-online">
              <span className="chip-pulse" /> {data?.bins.total ?? 0} {t("card.binsOnline")}
            </div>
            <div className="ambient-chip chip-ward">
              <MapPin size={12} /> DNCC Ward 27
            </div>
            <div className="ambient-chip chip-signal">
              <Sparkles size={12} /> {t("card.forecastActive")}
            </div>

            <div className="city-card">
              <div className="city-card-top">
                <span>
                  <i className="public-live-dot" /> {t("card.liveWardView")}
                </span>
                <span>
                  {new Date()
                    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    .toUpperCase()}
                </span>
              </div>
              <div className="city-card-title">
                <div>
                  <small>{t("card.todayAcross")}</small>
                  <strong>{t("card.cluster")}</strong>
                </div>
                <div className="city-score">
                  <b>{Math.round(data?.impact.avgSavedPercent ?? 0)}</b>
                  <small>{t("card.saved")}</small>
                </div>
              </div>
              <div className="mini-map">
                <div className="mini-water" />
                <div className="mini-road mini-road-a" />
                <div className="mini-road mini-road-b" />
                <div className="mini-route" />
                <span className="mini-pin pin-a">94%</span>
                <span className="mini-pin pin-b">83%</span>
                <span className="mini-pin pin-c">72%</span>
                <span className="mini-pin pin-d">49%</span>
                <span className="mini-pin pin-e">31%</span>
              </div>
              <div className="city-card-foot">
                <div>
                  <span>{t("card.binsMonitored")}</span>
                  <b>{data?.bins.total ?? 0}</b>
                </div>
                <div>
                  <span>{t("card.needAttention")}</span>
                  <b className="coral-text">{data?.bins.critical ?? 0}</b>
                </div>
                <div>
                  <span>{t("card.activeRoutes")}</span>
                  <b>{data?.routes.active ?? 0}</b>
                </div>
              </div>
            </div>

            <div className="floating-alert">
              <span className="alert-icon">
                <Zap size={15} fill="currentColor" />
              </span>
              <div>
                <strong>{t("card.routeOptimized")}</strong>
                <small>
                  {data?.impact.routesScored
                    ? `${bdt(data.impact.costSavedBdt)} ${t("card.savedSoFar")}`
                    : t("card.generateToSee")}
                </small>
              </div>
              <CircleCheck size={18} className="alert-check" />
            </div>

            <div className="floating-note">
              <span className="note-icon">
                <Radio size={14} />
              </span>
              <div>
                <strong>{t("card.smsReceived")}</strong>
                <small>{t("card.noSmartphone")}</small>
              </div>
            </div>
          </div>
        </section>

        <NewsWire />

        <section className="outcomes-strip reveal" id="impact">
          {outcomes.map((item, index) => (
            <div className={`outcome ${index === 0 ? "focused" : ""}`} key={item.label}>
              <strong>{item.value}</strong>
              <div>
                <b>{item.label}</b>
                <span>{item.copy}</span>
              </div>
              {index < outcomes.length - 1 && <i />}
            </div>
          ))}
        </section>

        <section className="story-section" id="how-it-works">
          <div className="story-intro reveal">
            <p className="public-kicker">{t("story.kicker")}</p>
            <h2>
              {t("story.title1")}
              <br />
              <em>{t("story.title2")}</em>
            </h2>
            <p>{t("story.body")}</p>
          </div>

          <div className="story-grid reveal reveal-stagger">
            <div className="story-card story-paper">
              <div className="story-icon">
                <Radio size={18} />
              </div>
              <span className="story-number">01</span>
              <h3>{t("story.step1")}</h3>
              <p>{t("story.step1body")}</p>
            </div>

            <div className="story-card story-lime">
              <div className="story-icon">
                <TrendingDown size={18} />
              </div>
              <span className="story-number">02</span>
              <h3>{t("story.step2")}</h3>
              <p>{t("story.step2body")}</p>
            </div>

            <div className="story-card story-paper">
              <div className="story-icon">
                <RouteIcon size={18} />
              </div>
              <span className="story-number">03</span>
              <h3>{t("story.step3")}</h3>
              <p>{t("story.step3body")}</p>
            </div>

            <div className="story-card story-ink">
              <div className="story-icon">
                <ShieldCheck size={18} />
              </div>
              <span className="story-number">04</span>
              <h3>{t("story.step4")}</h3>
              <p>{t("story.step4body")}</p>
            </div>
          </div>
        </section>

        <section className="city-section" id="for-cities">
          <div className="city-section-glow" />
          <div className="city-section-copy reveal">
            <p className="public-kicker">{t("cities.kicker")}</p>
            <h2>
              {t("cities.title1")}
              <br />
              <em>{t("cities.title2")}</em>
            </h2>
            <p>{t("cities.body")}</p>
            <div className="check-list">
              <span>
                <CircleCheck size={16} /> {t("cities.check1")}
              </span>
              <span>
                <CircleCheck size={16} /> {t("cities.check2")}
              </span>
              <span>
                <CircleCheck size={16} /> {t("cities.check3")}
              </span>
              <span>
                <CircleCheck size={16} /> {t("cities.check4")}
              </span>
            </div>
          </div>

          <div className="city-section-data reveal glow">
            <div className="data-top">
              <div>
                <small>{t("cities.measured")}</small>
                <strong>
                  {data?.impact.routesScored ?? 0} {t("cities.routesScored")}
                </strong>
              </div>
              <span className="route-pill">
                <Truck size={13} /> live
              </span>
            </div>
            <div className="data-chart">
              <div className="chart-grid">
                <div className="chart-bubble">
                  <span>{t("cities.distanceSaved")}</span>
                  <b>{(data?.impact.avgSavedPercent ?? 0).toFixed(1)}%</b>
                </div>
                <div className="chart-bubble">
                  <span>{t("cities.costAvoided")}</span>
                  <b>{bdt(data?.impact.costSavedBdt ?? 0)}</b>
                </div>
                <div className="chart-bubble">
                  <span>{t("cities.co2Avoided")}</span>
                  <b>{(data?.impact.co2SavedKg ?? 0).toFixed(1)} kg</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <RouteEngineSection />

        {/* ── On the ground ───────────────────────────────────────────── */}
        <section className="gallery-section reveal" id="on-the-ground">
          <div className="gallery-head">
            <p className="public-kicker">{t("gallery.kicker")}</p>
            <h2>
              {t("gallery.title1")}
              <br />
              <em>{t("gallery.title2")}</em>
            </h2>
            <p>{t("gallery.body")}</p>
          </div>

          <div className="gallery-grid reveal-stagger">
            {GALLERY.map((g, i) => (
              <Figure
                key={g.k}
                scene={g.scene}
                src={g.src}
                alt={t(g.k as never)}
                className="lift"
                caption={
                  <>
                    <span className="fig-step figure">{String(i + 1).padStart(2, "0")}</span>
                    <strong>{t(g.k as never)}</strong>
                    <span>{t(g.b as never)}</span>
                  </>
                }
              />
            ))}
          </div>

          <p className="gallery-note">{t("gallery.note")}</p>
        </section>

        {/* ── Which bin ───────────────────────────────────────────────── */}
        <BinStreams />

        {/* ── A day in the ward ───────────────────────────────────────── */}
        <section className="day-section reveal" id="a-day">
          <div className="story-intro">
            <p className="public-kicker">{t("day.kicker")}</p>
            <h2>
              {t("day.title1")}
              <br />
              <em>{t("day.title2")}</em>
            </h2>
            <p>{t("day.body")}</p>
          </div>

          <ol className="day-timeline reveal-stagger">
            {[
              { time: "00–05", icon: Moon, k: "day.t1", b: "day.t1body", level: 18, tone: "blue" },
              { time: "05–09", icon: Sunrise, k: "day.t2", b: "day.t2body", level: 92, tone: "coral" },
              { time: "12–15", icon: Gauge, k: "day.t3", b: "day.t3body", level: 58, tone: "violet" },
              { time: "15–19", icon: Sunset, k: "day.t4", b: "day.t4body", level: 100, tone: "amber" },
            ].map((row, i) => (
              <li key={row.time} style={{ "--i": i } as React.CSSProperties}>
                <span className={`day-icon ${row.tone}`}>
                  <row.icon size={16} />
                </span>
                <div className="day-body">
                  <span className="day-time figure">{row.time}</span>
                  <strong>{t(row.k as never)}</strong>
                  <p>{t(row.b as never)}</p>
                </div>
                <div className="day-bar" aria-hidden="true">
                  <i className={row.tone} style={{ height: `${row.level}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Capability grid ─────────────────────────────────────────── */}
        <section className="cap-section reveal" id="capabilities">
          <div className="cap-head">
            <p className="public-kicker">{t("cap.kicker")}</p>
            <h2>
              {t("cap.title1")} <em>{t("cap.title2")}</em>
            </h2>
          </div>
          <div className="cap-grid reveal-stagger">
            {[
              { icon: RouteIcon, k: "cap.c1", b: "cap.c1b", tone: "lime" },
              { icon: TrendingDown, k: "cap.c2", b: "cap.c2b", tone: "violet" },
              { icon: Radio, k: "cap.c3", b: "cap.c3b", tone: "blue" },
              { icon: ShieldCheck, k: "cap.c4", b: "cap.c4b", tone: "amber" },
              { icon: Zap, k: "cap.c5", b: "cap.c5b", tone: "lime" },
              { icon: Bot, k: "cap.c6", b: "cap.c6b", tone: "blue" },
            ].map((c, i) => (
              <div
                className={`cap-card cap-${c.tone} glow lift`}
                key={c.k}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className={`cap-icon ${c.tone}`}>
                  <c.icon size={18} />
                </span>
                <strong>{t(c.k as never)}</strong>
                <p>{t(c.b as never)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="brand-band reveal" id="brand">
          <BrandStatement
            kicker={t("brand.kicker")}
            meaning={t("brand.meaning")}
            tagline={t("brand.tagline")}
          />
        </section>

        <section className="roles-section reveal" id="roles">
          <div className="story-intro reveal">
            <p className="public-kicker">{t("auth.chooseRole")}</p>
            <h2>
              {t("roles.title1")}
              <br />
              <em>{t("roles.title2")}</em>
            </h2>
            <p>{t("roles.body")}</p>
          </div>

          <div className="roles-grid reveal reveal-stagger">
            {[
              { role: "staff", icon: Building2, whatKey: "auth.roleStaffWhat", tone: "lime" },
              { role: "officer", icon: Users, whatKey: "auth.roleOfficerWhat", tone: "blue" },
              { role: "driver", icon: Truck, whatKey: "auth.roleDriverWhat", tone: "amber" },
              { role: "citizen", icon: UserRound, whatKey: "auth.roleCitizenWhat", tone: "violet" },
            ].map((r, i) => (
              <div
                className="role-panel glow lift"
                key={r.role}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className={`role-icon ${r.tone}`}>
                  <r.icon size={19} />
                </span>
                <strong>{t(`role.${r.role}` as never)}</strong>
                <p>{t(r.whatKey as never)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="numbers-band reveal">
          <div>
            <strong>{data?.bins.total ?? 0}</strong>
            <span>{t("common.bins")}</span>
          </div>
          <div>
            <strong>4</strong>
            <span>{t("common.wards")}</span>
          </div>
          <div>
            <strong>{data?.impact.routesScored ?? 0}</strong>
            <span>{t("cities.routesScored")}</span>
          </div>
          <div>
            <strong>{(data?.impact.co2SavedKg ?? 0).toFixed(1)} kg</strong>
            <span>{t("cities.co2Avoided")}</span>
          </div>
          <div>
            <strong>0</strong>
            <span>{t("roles.noSensors")}</span>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section className="faq-section reveal" id="faq">
          <div className="faq-head">
            <p className="public-kicker">{t("faq.kicker")}</p>
            <h2>{t("faq.title")}</h2>
          </div>
          <div className="faq-list">
            {[
              { q: "faq.q1", a: "faq.a1" },
              { q: "faq.q2", a: "faq.a2" },
              { q: "faq.q3", a: "faq.a3" },
              { q: "faq.q4", a: "faq.a4" },
            ].map((row, i) => (
              <div className={`faq-item ${openFaq === i ? "open" : ""}`} key={row.q}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                  <span>{t(row.q as never)}</span>
                  <ChevronDown size={17} />
                </button>
                <div className="faq-answer">
                  <p>{t(row.a as never)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="final-cta reveal">
          <p className="public-kicker">{t("final.kicker")}</p>
          <h2>
            {t("final.title")} <em>SDG 11</em>
            <br />
            {t("final.title2")}
          </h2>
          <div className="hero-buttons" style={{ justifyContent: "center" }}>
            <Link href={home} className="public-primary">
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
