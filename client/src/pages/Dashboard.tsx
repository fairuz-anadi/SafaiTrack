/** Municipal staff overview — the primary operations screen. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  Filter,
  MoreHorizontal,
  Navigation,
  ShieldCheck,
  TrendingDown,
  Zap,
} from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { useCountUp, usePointerGlow, useRevealOnScroll } from "@/hooks/useMotion";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { SimulationBar } from "@/components/SimulationBar";
import { BinMap, type MapBin } from "@/components/map/BinMap";
import { LiveRouteCard, type RouteStopPin } from "@/components/map/LiveRouteCard";
import { LedgerCard, LogCard, type LogRow } from "@/components/editorial/Ledger";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { bdt, clockTime, duration, hoursUntil, km, pct, relativeTime } from "@/lib/format";
import { binTone, type BinView } from "@shared/types";

interface Overview {
  bins: { total: number; avgFill: number; critical: number; overflowing: number; overflowHours: number };
  complaints: { total: number; open: number; resolved: number; urgent: number; avgResolutionHours: number };
  routes: { total: number; active: number; completed: number; distanceKm: number };
  impact: {
    routesScored: number;
    avgSavedPercent: number;
    fuelSavedLitres: number;
    costSavedBdt: number;
    co2SavedKg: number;
    wastedStopsAvoided: number;
  };
  simulation: { simClock: string; ticksElapsed: number; minutesPerTick: number };
}

interface Forecast {
  binId: number;
  binCode: string;
  landmark: string;
  wardName: string;
  currentFillPercent: number;
  hoursToOverflow: number;
  confidence: number;
}

interface WardRow {
  wardId: number;
  name: string;
  binCount: number;
  criticalCount: number;
  avgFill: number;
}

/** Shape of `GET /routes/:id`, trimmed to what this card needs. */
interface LiveRoute {
  route: {
    routeId: number;
    routeCode: string;
    wardName: string;
    status: string;
    totalDistanceKm: number;
    estimatedMinutes: number;
    depotLat: number;
    depotLng: number;
    disposalLat: number;
    disposalLng: number;
  };
  stops: {
    binId: number;
    binCode: string;
    landmark: string;
    latitude: number;
    longitude: number;
    sequenceOrder: number;
    plannedFillPercent: number;
    currentFillPercent: number;
    stopStatus: string;
    plannedArrival: string | null;
    actualArrival: string | null;
  }[];
  comparison: {
    baselineDistanceKm: number;
    distanceSavedPercent: number;
    fuelSavedLitres: number;
    costSavedBdt: number;
  } | null;
}

interface ComplaintRow {
  complaintId: number;
  complaintCode: string;
  complaintType: string;
  status: string;
  priority: string;
  channel: string;
  locationText: string | null;
  createdAt: string;
}

/**
 * Pills have room for about two words. "Dhanmondi Road 15 kitchen market"
 * becomes "Dhanmondi 06" — the area plus the bin number, which is how a crew
 * would say it out loud anyway.
 */
function pillLabel(landmark: string, binCode: string): string {
  const words = landmark.replace(/,.*$/, "").split(/\s+/).filter(Boolean);
  // One word is usually enough, unless it is very short ("Green" -> "Green Road").
  const area = words[0] && words[0].length >= 6 ? words[0] : words.slice(0, 2).join(" ");
  const num = binCode.match(/B(\d+)$/)?.[1]?.slice(-2);
  return num ? `${area} ${num}` : area;
}

/** "R-27-96893" -> "DHK-27": the ward is what identifies the run on a wall. */
function shortRouteCode(routeCode: string): string {
  const ward = routeCode.match(/^R-(\d+)/)?.[1];
  return ward ? `DHK-${ward}` : routeCode;
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  trend,
  tone = "lime",
  decimals = 0,
  suffix = "",
  pad = 0,
}: {
  icon: typeof Boxes;
  label: string;
  /** Animated from its previous figure, so a tick reads as live telemetry. */
  value: number;
  detail: string;
  trend: string;
  tone?: string;
  decimals?: number;
  suffix?: string;
  /** Zero-pad to this width, matching the original design's "06" style. */
  pad?: number;
}) {
  const counted = useCountUp(value, 850, decimals);
  const shown = pad > 0 ? counted.padStart(pad, "0") : counted;
  return (
    <div className="stat-card lift glow">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>
          {shown}
          {suffix}
        </strong>
        <small className={trend.startsWith("+") ? "positive" : "muted"}>
          {trend} {detail}
        </small>
      </div>
      <MoreHorizontal className="stat-more" size={18} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [bins, setBins] = useState<BinView[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [wards, setWards] = useState<WardRow[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [liveRoute, setLiveRoute] = useState<LiveRoute | null>(null);
  const [selectedBin, setSelectedBin] = useState<BinView | null>(null);
  const [tab, setTab] = useState<"All bins" | "Critical" | "Watch">("All bins");
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");
  const glowRef = usePointerGlow<HTMLDivElement>();
  const revealRef = useRevealOnScroll<HTMLDivElement>();

  const load = useCallback(async () => {
    const [ov, bn, fc, wd, cp] = await Promise.all([
      api.get<Overview>("/analytics/overview"),
      api.get<{ bins: BinView[] }>("/bins"),
      api.get<{ forecasts: Forecast[] }>("/forecasts?hours=8"),
      api.get<{ wards: WardRow[] }>("/wards"),
      api.get<{ complaints: ComplaintRow[] }>("/complaints"),
    ]);
    setOverview(ov);
    setBins(bn.bins);
    setForecasts(fc.forecasts);
    setWards(wd.wards);
    setComplaints(cp.complaints.slice(0, 5));

    // Feature whichever route is furthest along: running, then dispatched,
    // then the most recent draft.
    const rl = await api.get<{ routes: { routeId: number; status: string }[] }>("/routes");
    const pick =
      rl.routes.find(r => r.status === "in_progress") ??
      rl.routes.find(r => r.status === "assigned") ??
      rl.routes[0];
    if (pick) {
      const detail = await api.get<LiveRoute>(`/routes/${pick.routeId}`);
      setLiveRoute(detail);
    } else {
      setLiveRoute(null);
    }
    setSelectedBin(prev => bn.bins.find(b => b.binId === prev?.binId) ?? bn.bins[0] ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 4200);
  };

  const visibleBins = useMemo(() => {
    if (tab === "Critical") return bins.filter(b => b.currentFillPercent >= 85);
    if (tab === "Watch")
      return bins.filter(b => b.currentFillPercent >= 65 && b.currentFillPercent < 85);
    return bins;
  }, [bins, tab]);

  /** Generate a route for whichever ward is in the worst shape right now. */
  const optimizeWorstWard = async () => {
    const worst = [...wards].sort(
      (a, b) => b.criticalCount - a.criticalCount || b.avgFill - a.avgFill
    )[0];
    if (!worst) return;

    setGenerating(true);
    try {
      const res = await api.post<{
        route: { routeId: number; routeCode: string };
        comparison: { distanceSavedPercent: number; costSavedBdt: number };
      }>("/routes/generate", { wardId: worst.wardId, thresholdPercent: 55, maxStops: 20, lookaheadHours: 6 });
      notify(
        `${res.route.routeCode} generated for ${worst.name} — ${res.comparison.distanceSavedPercent}% shorter than the fixed schedule, ${bdt(res.comparison.costSavedBdt)} saved.`
      );
      navigate(`/routes/${res.route.routeId}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate a route");
    } finally {
      setGenerating(false);
    }
  };

  const mapBins: MapBin[] = visibleBins.map(b => ({
    binId: b.binId,
    binCode: b.binCode,
    landmark: b.landmark,
    latitude: b.latitude,
    longitude: b.longitude,
    currentFillPercent: b.currentFillPercent,
  }));

  const coverage = overview ? Math.max(0, Math.round(100 - overview.bins.avgFill)) : 0;

  /**
   * Only the first four stops get a name pill — past that the labels collide
   * and the card stops being readable. The rest stay as plain rings.
   */
  const livePins: RouteStopPin[] = (liveRoute?.stops ?? []).map((s, i) => ({
    binId: s.binId,
    sequence: s.sequenceOrder,
    label: pillLabel(s.landmark, s.binCode),
    lat: s.latitude,
    lng: s.longitude,
    alert: s.currentFillPercent >= 85,
    minor: i >= 4,
  }));

  const livePath = liveRoute
    ? [
        { lat: liveRoute.route.depotLat, lng: liveRoute.route.depotLng },
        ...liveRoute.stops.map(s => ({ lat: s.latitude, lng: s.longitude })),
        { lat: liveRoute.route.disposalLat, lng: liveRoute.route.disposalLng },
      ]
    : [];

  const logRows: LogRow[] = (liveRoute?.stops ?? []).slice(0, 6).map(s => ({
    key: s.binId,
    time: s.actualArrival
      ? clockTime(s.actualArrival)
      : s.plannedArrival
        ? clockTime(s.plannedArrival)
        : "--:--",
    sequence: s.sequenceOrder,
    name: s.landmark.split(",")[0].trim(),
    sub: s.binCode,
    fillPercent: s.currentFillPercent,
    done: s.stopStatus === "collected",
  }));

  return (
    <AppShell title={`${t("dash.greeting")}, ${user?.fullName.split(" ")[0] ?? ""}`}>
      <SimulationBar state={overview?.simulation ?? null} onAdvanced={() => void load()} />

      <section className="hero-row ambient-host">
        <AmbientNetwork className="feather" intensity={0.5} density={0.6} showTruck={false} />
        <div>
          <p className="section-kicker">
            <span className="live-dot" /> {t("dash.liveOps")}
          </p>
          <h2>
            {t("dash.title1")} <em>{t("dash.title2")}</em>
          </h2>
          <p className="hero-copy">{t("dash.sub")}</p>
        </div>
        <div className="hero-actions">
          <button className="primary-button" onClick={() => void optimizeWorstWard()} disabled={generating}>
            {generating ? <span className="spinner" /> : <Zap size={16} fill="currentColor" />}
            {generating ? t("dash.optimizing") : t("dash.optimizeWorst")}
          </button>
        </div>
      </section>

      <section className="stats-grid reveal-stagger" ref={glowRef}>
        <StatCard
          icon={Boxes}
          label={t("dash.binsMonitored")}
          value={overview?.bins.total ?? 0}
          detail={`${t("dash.binsMonitoredSub")} ${wards.length} ${t("common.wards")}`}
          trend={`${overview?.bins.avgFill ?? 0}%`}
        />
        <StatCard
          icon={AlertCircle}
          label={t("dash.needAttention")}
          value={overview?.bins.critical ?? 0}
          detail={t("dash.needAttentionSub")}
          trend={String(overview?.bins.overflowing ?? 0)}
          tone="coral"
        />
        <StatCard
          icon={Navigation}
          label={t("dash.activeRoutes")}
          value={overview?.routes.active ?? 0}
          pad={2}
          detail={t("dash.activeRoutesSub")}
          trend={km(overview?.routes.distanceKm ?? 0)}
          tone="blue"
        />
        <StatCard
          icon={ShieldCheck}
          label={t("dash.avgResolution")}
          value={overview?.complaints.avgResolutionHours ?? 0}
          suffix="h"
          detail={t("dash.avgResolutionSub")}
          trend={String(overview?.complaints.open ?? 0)}
          tone="violet"
        />
      </section>

      {/* ── Live route, presented ─────────────────────────────────────── */}
      {liveRoute && (
        <section className="live-grid reveal">
          <LiveRouteCard
            routeCode={shortRouteCode(liveRoute.route.routeCode)}
            stops={livePins}
            path={livePath}
          />

          <div className="live-side">
            <LedgerCard
              kicker={t("live.runLedger")}
              meta={liveRoute.route.wardName}
              rows={[
                { label: t("live.ledgerStops"), value: String(liveRoute.stops.length) },
                {
                  label: t("live.ledgerDistance"),
                  value: `${liveRoute.route.totalDistanceKm} km`,
                },
                {
                  label: t("live.ledgerBaseline"),
                  value: liveRoute.comparison
                    ? `${liveRoute.comparison.baselineDistanceKm} km`
                    : "—",
                },
                {
                  label: t("live.ledgerSaved"),
                  value: liveRoute.comparison
                    ? `${liveRoute.comparison.distanceSavedPercent.toFixed(1)}%`
                    : "—",
                  trend: "up",
                },
                {
                  label: t("live.ledgerFuel"),
                  value: liveRoute.comparison
                    ? `${liveRoute.comparison.fuelSavedLitres} L`
                    : "—",
                },
                {
                  label: t("live.ledgerCost"),
                  value: liveRoute.comparison ? bdt(liveRoute.comparison.costSavedBdt) : "—",
                  trend: "up",
                },
                {
                  label: t("live.ledgerTime"),
                  value: duration(liveRoute.route.estimatedMinutes),
                },
              ]}
            />

            <LogCard
              kicker={t("live.stopLog")}
              meta={`${liveRoute.stops.filter(s => s.stopStatus === "collected").length}/${liveRoute.stops.length}`}
              rows={logRows}
              empty={t("live.noStops")}
            />
          </div>
        </section>
      )}

      <section className="dashboard-grid">
        <div className="map-card panel-card padded lift">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("dash.wardNetwork")}</p>
              <h3>{t("dash.liveBinIntel")}</h3>
            </div>
            <button className="ghost-button" onClick={() => navigate("/bins")}>
              <Filter size={15} /> {t("dash.allBins")}
            </button>
          </div>

          <div className="map-toolbar">
            <div className="tabs">
              {(["All bins", "Critical", "Watch"] as const).map(tabKey => (
                <button
                  key={tabKey}
                  className={tab === tabKey ? "active" : ""}
                  onClick={() => setTab(tabKey)}
                >
                  {tabKey === "All bins"
                    ? t("dash.allBins")
                    : tabKey === "Critical"
                      ? t("common.critical")
                      : t("common.watch")}
                  <span>
                    {tabKey === "All bins"
                      ? bins.length
                      : tabKey === "Critical"
                        ? bins.filter(b => b.currentFillPercent >= 85).length
                        : bins.filter(b => b.currentFillPercent >= 65 && b.currentFillPercent < 85).length}
                  </span>
                </button>
              ))}
            </div>
            <span className="map-updated">
              <span className="live-dot" /> {t("dash.realCoords")}
            </span>
          </div>

          <div style={{ height: 400, margin: "0 0 14px" }}>
            <BinMap
              bins={mapBins}
              selectedBinId={selectedBin?.binId}
              onSelectBin={b => setSelectedBin(bins.find(x => x.binId === b.binId) ?? null)}
            />
          </div>

          <div className="selected-bin-strip">
            {selectedBin ? (
              <>
                <div className={`bin-status-mark ${binTone(selectedBin.currentFillPercent)}`}>
                  <Boxes size={16} />
                </div>
                <div className="selected-bin-info">
                  <strong>{selectedBin.landmark}</strong>
                  <span>
                    {selectedBin.binCode} · {selectedBin.wardName} · {t("dash.emptied")}{" "}
                    {relativeTime(selectedBin.lastCollectedAt)}
                  </span>
                </div>
                <div className="selected-bin-fill">
                  <small>{t("dash.fillLevel")}</small>
                  <b>{selectedBin.currentFillPercent}%</b>
                  <div className="fill-wrap">
                    <div
                      className={`fill-bar ${binTone(selectedBin.currentFillPercent)}`}
                      style={{ width: `${selectedBin.currentFillPercent}%` }}
                    />
                    <span>{selectedBin.currentFillPercent}%</span>
                  </div>
                </div>
                {selectedBin.hoursToOverflow !== null && (
                  <div className="selected-bin-fill">
                    <small>{t("dash.overflowsIn")}</small>
                    <b>{hoursUntil(selectedBin.hoursToOverflow)}</b>
                  </div>
                )}
              </>
            ) : (
              <span>{t("dash.selectBin")}</span>
            )}
          </div>
        </div>

        <div className="side-column">
          {/* Measured saving — the headline judging asset. */}
          <div className="panel-card route-card padded lift glow">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("dash.measuredImpact")}</p>
                <h3>{t("dash.vsFixed")}</h3>
              </div>
              <button className="more-button" onClick={() => navigate("/impact")}>
                <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="route-score">
              <div className="score-ring">
                <span>{Math.round(overview?.impact.avgSavedPercent ?? 0)}</span>
                <small>%</small>
              </div>
              <div>
                <strong>{t("dash.distanceSaved")}</strong>
                <p>
                  {t("dash.averagedOver")} {overview?.impact.routesScored ?? 0}
                  <br />
                  {t("dash.scoredRoutes")}
                </p>
              </div>
            </div>
            <div className="mini-bars">
              <div>
                <span>{t("dash.fuelNotBurned")}</span>
                <b>{(overview?.impact.fuelSavedLitres ?? 0).toFixed(1)} L</b>
                <i>
                  <em style={{ width: `${Math.min(100, (overview?.impact.avgSavedPercent ?? 0) * 2.4)}%` }} />
                </i>
              </div>
              <div>
                <span>{t("dash.costAvoided")}</span>
                <b>{bdt(overview?.impact.costSavedBdt ?? 0)}</b>
                <i>
                  <em style={{ width: `${Math.min(100, (overview?.impact.avgSavedPercent ?? 0) * 2.4)}%` }} />
                </i>
              </div>
              <div>
                <span>{t("dash.co2Avoided")}</span>
                <b>{(overview?.impact.co2SavedKg ?? 0).toFixed(1)} kg</b>
                <i>
                  <em style={{ width: `${Math.min(100, (overview?.impact.avgSavedPercent ?? 0) * 2.4)}%` }} />
                </i>
              </div>
            </div>
            <button className="text-button" onClick={() => navigate("/impact")}>
              {t("dash.seeProof")} <ArrowUpRight size={15} />
            </button>
          </div>

          {/* Predictive layer */}
          <div className="panel-card coverage-card padded lift glow">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("dash.forecastKicker")}</p>
                <h3>{t("dash.next8")}</h3>
              </div>
              <span className="soft-badge">
                {forecasts.length} {t("common.bins")}
              </span>
            </div>
            {forecasts.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0 4px", lineHeight: 1.6 }}>
                {t("dash.noForecast")}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 7, marginTop: 4 }}>
                {forecasts.slice(0, 4).map(f => (
                  <div className="forecast-row" key={f.binId} style={{ marginBottom: 0 }}>
                    <div
                      className={`forecast-clock ${
                        f.hoursToOverflow <= 2 ? "imminent" : f.hoursToOverflow <= 5 ? "soon" : "later"
                      }`}
                    >
                      {hoursUntil(f.hoursToOverflow)}
                      <small>{t("dash.left")}</small>
                    </div>
                    <div className="forecast-info">
                      <strong>{f.binCode}</strong>
                      <span>
                        {f.landmark} · {f.currentFillPercent}%
                      </span>
                    </div>
                    <div className="confidence-bar">
                      <span>{Math.round(f.confidence * 100)}%</span>
                      <i>
                        <em style={{ width: `${f.confidence * 100}%` }} />
                      </i>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="coverage-footer">
              <span>
                <TrendingDown size={14} /> {t("dash.predictedFrom")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="bottom-grid reveal" ref={revealRef}>
        <div className="panel-card complaints-card padded lift">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("dash.citizenSignals")}</p>
              <h3>{t("dash.latestComplaints")}</h3>
            </div>
            <button className="text-button" onClick={() => navigate("/complaints")}>
              {t("common.viewAll")} <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="complaints-list">
            {complaints.length === 0 && <p className="empty-state">{t("dash.noComplaints")}</p>}
            {complaints.map(item => {
              const tone =
                item.priority === "urgent"
                  ? "coral"
                  : item.status === "resolved"
                    ? "green"
                    : item.status === "in_progress"
                      ? "amber"
                      : "blue";
              return (
                <div className="complaint-row" key={item.complaintId}>
                  <div className={`complaint-icon ${tone}`}>
                    <AlertCircle size={16} />
                  </div>
                  <div className="complaint-info">
                    <strong>{item.locationText ?? item.complaintType.replace("_", " ")}</strong>
                    <span>
                      {item.complaintCode} · {relativeTime(item.createdAt)} ·{" "}
                      <span className={`channel-tag ${item.channel === "web" ? "web" : ""}`}>
                        {item.channel}
                      </span>
                    </span>
                  </div>
                  <span className={`status-pill ${tone}`}>{item.status.replace("_", " ")}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel-card activity-card padded lift">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("dash.leagueKicker")}</p>
              <h3>{t("dash.wherePressure")}</h3>
            </div>
          </div>
          <div className="activity-list">
            {[...wards]
              .sort((a, b) => b.avgFill - a.avgFill)
              .map(w => (
                <div className="activity-item" key={w.wardId}>
                  <div
                    className={`activity-icon ${
                      w.criticalCount >= 3 ? "coral" : w.criticalCount > 0 ? "blue" : "lime"
                    }`}
                  >
                    <Boxes size={15} />
                  </div>
                  <div>
                    <strong>{w.name}</strong>
                    <span>
                      {w.binCount} {t("common.bins")} · {w.criticalCount} {t("common.critical")}
                    </span>
                  </div>
                  <time>{pct(w.avgFill, 0)}</time>
                </div>
              ))}
          </div>
        </div>
      </section>

      {toast && (
        <div className="toast">
          <div className="toast-check">
            <Zap size={14} fill="currentColor" />
          </div>
          <span>{toast}</span>
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}

      <AgentPanel />
    </AppShell>
  );
}
