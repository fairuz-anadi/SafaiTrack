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
  CircleCheck,
  FileText,
  Leaf,
  MapPin,
  Menu,
  Radio,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
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
      label: "less collection distance",
      copy: "measured against the fixed schedule",
    },
    {
      value: data ? String(data.bins.total) : "—",
      label: "bins monitored live",
      copy: "across four Dhaka North wards",
    },
    {
      value: data ? `${data.complaints.avgResolutionHours}h` : "—",
      label: "average resolution time",
      copy: "from citizen report to closed",
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
          <span className="public-brand-mark">
            <Leaf size={17} fill="currentColor" />
          </span>
          <span>
            <b>
              Safai<span>Track</span>
            </b>
            <small>Dhaka City Operations</small>
          </span>
        </Link>

        <nav className={`public-links ${mobileOpen ? "open" : ""}`}>
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
              <b>Click anywhere</b> — run a collection sweep
            </p>
            <div className="hero-trust">
              <div className="mini-avatars">
                <span>FA</span>
                <span>EA</span>
                <span>SM</span>
                <b>+</b>
              </div>
              <span>Built for ward teams, drivers and citizens</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="ambient-chip chip-online">
              <span className="chip-pulse" /> {data?.bins.total ?? 0} bins online
            </div>
            <div className="ambient-chip chip-ward">
              <MapPin size={12} /> DNCC Ward 27
            </div>
            <div className="ambient-chip chip-signal">
              <Sparkles size={12} /> Forecast active
            </div>

            <div className="city-card">
              <div className="city-card-top">
                <span>
                  <i className="public-live-dot" /> LIVE WARD VIEW
                </span>
                <span>
                  {new Date()
                    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    .toUpperCase()}
                </span>
              </div>
              <div className="city-card-title">
                <div>
                  <small>Today across</small>
                  <strong>Dhanmondi cluster</strong>
                </div>
                <div className="city-score">
                  <b>{Math.round(data?.impact.avgSavedPercent ?? 0)}</b>
                  <small>% saved</small>
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
                  <span>Bins monitored</span>
                  <b>{data?.bins.total ?? 0}</b>
                </div>
                <div>
                  <span>Need attention</span>
                  <b className="coral-text">{data?.bins.critical ?? 0}</b>
                </div>
                <div>
                  <span>Active routes</span>
                  <b>{data?.routes.active ?? 0}</b>
                </div>
              </div>
            </div>

            <div className="floating-alert">
              <span className="alert-icon">
                <Zap size={15} fill="currentColor" />
              </span>
              <div>
                <strong>Route optimized</strong>
                <small>
                  {data?.impact.routesScored
                    ? `${bdt(data.impact.costSavedBdt)} saved so far`
                    : "Generate one to see the saving"}
                </small>
              </div>
              <CircleCheck size={18} className="alert-check" />
            </div>

            <div className="floating-note">
              <span className="note-icon">
                <Radio size={14} />
              </span>
              <div>
                <strong>SMS report received</strong>
                <small>No smartphone needed</small>
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
            <p className="public-kicker">ONE SYSTEM, EVERY SIGNAL</p>
            <h2>
              From overflow
              <br />
              to <em>action.</em>
            </h2>
            <p>
              Collection should respond to what is happening now — not to a schedule written years
              ago. SafaiTrack closes that loop in four steps, without a single piece of new hardware
              in the field.
            </p>
          </div>

          <div className="story-grid reveal reveal-stagger">
            <div className="story-card story-paper">
              <div className="story-icon">
                <Radio size={18} />
              </div>
              <span className="story-number">01</span>
              <h3>Signals arrive</h3>
              <p>
                Bin fill data comes from a simulated sensor feed and from residents reporting by web,
                SMS or USSD. Both are written to the same table a real ultrasonic sensor would use,
                so a hardware retrofit needs no redesign.
              </p>
            </div>

            <div className="story-card story-lime">
              <div className="story-icon">
                <TrendingDown size={18} />
              </div>
              <span className="story-number">02</span>
              <h3>The system predicts</h3>
              <p>
                Each bin's own fill rate is fitted from its reading history, projecting the hour it
                will overflow. Routes get planned before waste hits the street, not after someone
                complains about it.
              </p>
            </div>

            <div className="story-card story-paper">
              <div className="story-icon">
                <RouteIcon size={18} />
              </div>
              <span className="story-number">03</span>
              <h3>Routes optimize</h3>
              <p>
                Dijkstra shortest paths over the ward's road graph, a priority-weighted nearest
                neighbour construction, then a 2-opt refinement. Full bins come first; near-empty
                bins are skipped entirely.
              </p>
            </div>

            <div className="story-card story-ink">
              <div className="story-icon">
                <ShieldCheck size={18} />
              </div>
              <span className="story-number">04</span>
              <h3>Everyone is accountable</h3>
              <p>
                Drivers log each collection. Every complaint status change is appended, never
                overwritten, and attributed to a named officer. Residents watch their own report
                move from filed to resolved.
              </p>
            </div>
          </div>
        </section>

        <section className="city-section" id="for-cities">
          <div className="city-section-glow" />
          <div className="city-section-copy reveal">
            <p className="public-kicker">FOR CITY TEAMS</p>
            <h2>
              Smart-city results on a
              <br />
              <em>city-corporation budget.</em>
            </h2>
            <p>
              Commercial platforms deliver this by putting a sensor in every bin — which is exactly
              the cost most Bangladeshi city corporations cannot carry. SafaiTrack keeps the routing
              intelligence and drops the hardware bill, while leaving the schema ready for real
              sensors whenever they can be afforded.
            </p>
            <div className="check-list">
              <span>
                <CircleCheck size={16} /> No per-bin hardware, no connectivity contracts
              </span>
              <span>
                <CircleCheck size={16} /> Runs offline on a single laptop when the network drops
              </span>
              <span>
                <CircleCheck size={16} /> Every saving figure is auditable, with stated constants
              </span>
              <span>
                <CircleCheck size={16} /> Bengali interface and an SMS channel for every resident
              </span>
            </div>
          </div>

          <div className="city-section-data reveal glow">
            <div className="data-top">
              <div>
                <small>Measured to date</small>
                <strong>{data?.impact.routesScored ?? 0} routes scored</strong>
              </div>
              <span className="route-pill">
                <Truck size={13} /> live
              </span>
            </div>
            <div className="data-chart">
              <div className="chart-grid">
                <div className="chart-bubble">
                  <span>Distance saved</span>
                  <b>{(data?.impact.avgSavedPercent ?? 0).toFixed(1)}%</b>
                </div>
                <div className="chart-bubble">
                  <span>Cost avoided</span>
                  <b>{bdt(data?.impact.costSavedBdt ?? 0)}</b>
                </div>
                <div className="chart-bubble">
                  <span>CO₂ avoided</span>
                  <b>{(data?.impact.co2SavedKg ?? 0).toFixed(1)} kg</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta reveal">
          <p className="public-kicker">READY WHEN YOU ARE</p>
          <h2>
            Aligned with <em>SDG 11</em> — and with
            <br />
            the street outside your window.
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
          <span className="public-brand-mark">
            <Leaf size={15} fill="currentColor" />
          </span>
          <b>SafaiTrack</b>
        </div>
        <span>Smart waste collection and route optimization for Dhaka neighbourhoods</span>
        <span>SDG 11 · Sustainable Cities and Communities</span>
      </footer>
    </div>
  );
}
