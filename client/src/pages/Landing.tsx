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
  Building2,
  CircleCheck,
  FileText,
  MapPin,
  Menu,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Truck,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { BrandLockup, BrandMark, BrandStatement, Wordmark } from "@/components/brand/Brand";
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

export default function Landing() {
  const { user } = useAuth();
  const { t } = useI18n();
  const revealRef = useRevealOnScroll<HTMLDivElement>();
  const glowRef = usePointerGlow<HTMLDivElement>();
  const [mobileOpen, setMobileOpen] = useState(false);
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
        <Link href="/" className="public-brand">
          <BrandLockup size={34} />
        </Link>

        <nav className={`public-links ${mobileOpen ? "open" : ""}`}>
          <Link href="/about" onClick={() => setMobileOpen(false)}>
            {t("nav.problem")}
          </Link>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)}>
            {t("nav.howItWorks")}
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
