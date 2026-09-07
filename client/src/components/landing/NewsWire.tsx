/**
 * The live wire strip under the hero.
 *
 * A ticker on a landing page is usually decoration — a loop of slogans that
 * says nothing. This one is wired to `/analytics/overview` and
 * `/analytics/wards`, the same two endpoints the signed-in dashboard reads,
 * so every headline that scrolls past is a fact about the running system:
 * how many bins are over the critical line right now, which ward is worst,
 * what the optimiser has actually saved, where the simulation clock is.
 *
 * It refreshes every thirty seconds. Until the first response lands it holds
 * its row with a single static line rather than looping invented copy — the
 * point of the strip is that nothing on it is invented.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Leaf,
  MapPin,
  MessageSquare,
  Route as RouteIcon,
  TrendingDown,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { bdt } from "@/lib/format";

interface Overview {
  bins: { total: number; critical: number; overflowing: number; avgFill: number };
  complaints: { open: number; resolved: number; avgResolutionHours: number };
  routes: { active: number; completed: number; distanceKm: number };
  impact: {
    avgSavedPercent: number;
    costSavedBdt: number;
    co2SavedKg: number;
    routesScored: number;
  };
  simulation: { simClock: string; ticksElapsed: number; isRunning: boolean };
}

interface WardRow {
  wardId: number;
  name: string;
  nameBn: string | null;
  avgFill: number;
  critical: number;
}

type Tone = "lime" | "coral" | "amber" | "blue";

interface Headline {
  id: string;
  tone: Tone;
  icon: typeof Leaf;
  /** The lead-in, already translated. */
  text: string;
  /** The figure, set apart so it can carry the accent colour. */
  value: string;
}

/** How long one full pass takes, scaled to how much there is to read. */
const SECONDS_PER_ITEM = 5.2;

export function NewsWire() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [wards, setWards] = useState<WardRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [overview, wardList] = await Promise.all([
          api.get<Overview>("/analytics/overview"),
          api.get<{ wards: WardRow[] }>("/analytics/wards"),
        ]);
        if (cancelled) return;
        setData(overview);
        setWards(wardList.wards);
      } catch {
        /* the wire is ornament on top of the page — it never takes it down */
      }
    };

    void load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const headlines = useMemo<Headline[]>(() => {
    if (!data) return [];

    /* The wards endpoint is ordered by average fill, so the head of the list
       is the ward under most pressure right now. */
    const worst = wards[0];
    const wardName = worst ? (lang === "bn" && worst.nameBn ? worst.nameBn : worst.name) : null;

    const rows: (Headline | null)[] = [
      {
        id: "critical",
        tone: data.bins.critical > 0 ? "coral" : "lime",
        icon: AlertTriangle,
        text: t("wire.critical"),
        value: String(data.bins.critical),
      },
      {
        id: "fill",
        tone: "amber",
        icon: Trash2,
        text: t("wire.avgFill"),
        value: `${data.bins.avgFill}%`,
      },
      wardName
        ? {
            id: "ward",
            tone: "coral",
            icon: MapPin,
            text: t("wire.worstWard", { ward: wardName }),
            value: `${worst.avgFill}%`,
          }
        : null,
      {
        id: "routes",
        tone: "lime",
        icon: RouteIcon,
        text: t("wire.routes"),
        value: String(data.routes.active),
      },
      data.impact.routesScored > 0
        ? {
            id: "saved",
            tone: "lime",
            icon: TrendingDown,
            text: t("wire.saved"),
            value: `${data.impact.avgSavedPercent.toFixed(1)}%`,
          }
        : null,
      data.impact.costSavedBdt > 0
        ? {
            id: "cost",
            tone: "lime",
            icon: Leaf,
            text: t("wire.cost"),
            value: bdt(data.impact.costSavedBdt),
          }
        : null,
      {
        id: "complaints",
        tone: data.complaints.open > 0 ? "amber" : "lime",
        icon: MessageSquare,
        text: t("wire.complaints"),
        value: String(data.complaints.open),
      },
      data.complaints.avgResolutionHours > 0
        ? {
            id: "resolution",
            tone: "blue",
            icon: Clock3,
            text: t("wire.resolution"),
            value: `${data.complaints.avgResolutionHours}h`,
          }
        : null,
      {
        id: "clock",
        tone: "blue",
        icon: Clock3,
        text: t(data.simulation.isRunning ? "wire.simLive" : "wire.simPaused"),
        value: `${t("sim.tick")} ${data.simulation.ticksElapsed}`,
      },
    ];

    return rows.filter((r): r is Headline => r !== null);
  }, [data, wards, lang, t]);

  /* Before the first response the strip still occupies its row. Unmounting it
     and popping it back in would shove the whole page down a notch a beat
     after load, which is the one thing a ticker must not do. */
  if (headlines.length === 0) {
    return (
      <div className="newswire is-waiting">
        <div className="newswire-label">
          <span aria-hidden="true" />
          {t("wire.label")}
        </div>
        <div className="newswire-track">
          <span className="wire-item">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  /* One run of the headlines. Two of these sit side by side inside the track:
     the keyframe moves the pair left by exactly the width of one run, so at
     the moment it snaps back the second run is sitting precisely where the
     first started. That is what makes the loop seamless — a single run would
     leave a blank stretch behind it before it wrapped. */
  const run = (copy: number) => (
    <div className="newswire-run" aria-hidden={copy === 1} key={copy}>
      {headlines.map(h => (
        <span className={`wire-item tone-${h.tone}`} key={`${copy}-${h.id}`}>
          <h.icon size={14} />
          {h.text} <b>{h.value}</b>
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="newswire"
      style={
        {
          "--wire-duration": `${(headlines.length * SECONDS_PER_ITEM).toFixed(1)}s`,
        } as React.CSSProperties
      }
    >
      <div className="newswire-label">
        <span aria-hidden="true" />
        {t("wire.label")}
      </div>
      {/* A live region would announce every headline as it scrolls, which is
          hostile. The figures all appear elsewhere on the page in prose. */}
      <div className="newswire-track">
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}
