/** Route list plus the route generator. */
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Route as RouteIcon, Sliders, Zap } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { bdt, dateTime, duration, titleCase } from "@/lib/format";

interface WardRow {
  wardId: number;
  name: string;
  binCount: number;
  criticalCount: number;
  avgFill: number;
}

interface RouteRow {
  routeId: number;
  routeCode: string;
  wardName: string;
  status: string;
  totalDistanceKm: number;
  baselineDistanceKm: number;
  optimizedStopCount: number;
  baselineStopCount: number;
  costSavedBdt: number;
  co2SavedKg: number;
  estimatedMinutes: number;
  generatedAt: string;
  plateNumber: string | null;
  driverName: string | null;
}

const STATUS_TONE: Record<string, string> = {
  draft: "blue",
  assigned: "amber",
  in_progress: "amber",
  completed: "green",
  cancelled: "coral",
};

export default function RoutesPage() {
  const { t } = useI18n();
  const [wards, setWards] = useState<WardRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [wardId, setWardId] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(55);
  const [maxStops, setMaxStops] = useState(20);
  const [lookahead, setLookahead] = useState(6);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const [w, r] = await Promise.all([
      api.get<{ wards: WardRow[] }>("/wards"),
      api.get<{ routes: RouteRow[] }>("/routes"),
    ]);
    setWards(w.wards);
    setRoutes(r.routes);
    setWardId(prev => prev ?? w.wards[0]?.wardId ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    if (!wardId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post<{
        route: { routeId: number; routeCode: string };
        comparison: { distanceSavedPercent: number; costSavedBdt: number; optimizedStopCount: number };
      }>("/routes/generate", {
        wardId,
        thresholdPercent: threshold,
        maxStops,
        lookaheadHours: lookahead,
      });
      setMessage({
        ok: true,
        text: `${res.route.routeCode} generated — ${res.comparison.optimizedStopCount} stops, ${res.comparison.distanceSavedPercent}% shorter than the fixed schedule, ${bdt(res.comparison.costSavedBdt)} saved.`,
      });
      await load();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Could not generate a route",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title={t("routes.title")} eyebrow={t("routes.eyebrow")}>
      <div className="panel-card padded" style={{ marginBottom: 20 }}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("routes.generate")}</p>
            <h3>{t("routes.planRun")}</h3>
          </div>
          <span className="soft-badge">
            <Sliders size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
            dijkstra + nn + 2-opt
          </span>
        </div>

        <div className="filter-row" style={{ marginTop: 6 }}>
          <label className="auth-field" style={{ marginBottom: 0, minWidth: 210 }}>
            <span>{t("common.ward")}</span>
            <select value={wardId ?? ""} onChange={e => setWardId(Number(e.target.value))}>
              {wards.map(w => (
                <option key={w.wardId} value={w.wardId}>
                  {w.name} — {w.criticalCount} / {w.binCount}
                </option>
              ))}
            </select>
          </label>
          <label className="auth-field" style={{ marginBottom: 0, width: 155 }}>
            <span>{t("routes.collectAbove")}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
            />
          </label>
          <label className="auth-field" style={{ marginBottom: 0, width: 130 }}>
            <span>{t("routes.maxStops")}</span>
            <input
              type="number"
              min={1}
              max={60}
              value={maxStops}
              onChange={e => setMaxStops(Number(e.target.value))}
            />
          </label>
          <label className="auth-field" style={{ marginBottom: 0, width: 165 }}>
            <span>{t("routes.lookahead")}</span>
            <input
              type="number"
              min={0}
              max={48}
              value={lookahead}
              onChange={e => setLookahead(Number(e.target.value))}
            />
          </label>
          <button
            className="primary-button"
            onClick={() => void generate()}
            disabled={busy || !wardId}
            style={{ marginTop: 20 }}
          >
            {busy ? <span className="spinner" /> : <Zap size={16} fill="currentColor" />}
            {busy ? t("dash.optimizing") : t("routes.generateBtn")}
          </button>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 0", lineHeight: 1.6 }}>
          {t("routes.eligibilityNote")}
        </p>

        {message && (
          <div
            className={message.ok ? "method-note" : "auth-error"}
            style={{ marginTop: 14, marginBottom: 0 }}
          >
            {message.text}
          </div>
        )}
      </div>

      <div className="panel-card padded">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("routes.history")}</p>
            <h3>{t("routes.generated")}</h3>
          </div>
          <span className="soft-badge">{routes.length}</span>
        </div>

        {routes.length === 0 ? (
          <div className="empty-state">
            <RouteIcon size={30} />
            <p>{t("routes.none")}</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("nav.routes")}</th>
                  <th>{t("common.ward")}</th>
                  <th>{t("common.status")}</th>
                  <th className="num">{t("common.stops")}</th>
                  <th className="num">{t("common.distance")}</th>
                  <th className="num">{t("routes.vsBaseline")}</th>
                  <th className="num">{t("routes.estTime")}</th>
                  <th>{t("routes.assigned")}</th>
                  <th>{t("routes.generated")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {routes.map(r => {
                  const saved =
                    r.baselineDistanceKm > 0
                      ? ((r.baselineDistanceKm - r.totalDistanceKm) / r.baselineDistanceKm) * 100
                      : 0;
                  return (
                    <tr key={r.routeId}>
                      <td>
                        <b>{r.routeCode}</b>
                      </td>
                      <td>{r.wardName}</td>
                      <td>
                        <span className={`status-pill ${STATUS_TONE[r.status] ?? "blue"}`}>
                          {titleCase(r.status)}
                        </span>
                      </td>
                      <td className="num">
                        {r.optimizedStopCount}
                        <span style={{ color: "var(--muted)" }}> / {r.baselineStopCount}</span>
                      </td>
                      <td className="num">{r.totalDistanceKm} km</td>
                      <td className="num">
                        <b style={{ color: "var(--lime-deep)" }}>−{saved.toFixed(1)}%</b>
                      </td>
                      <td className="num">{duration(r.estimatedMinutes)}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {r.driverName ? (
                          <>
                            {r.driverName}
                            <br />
                            <span style={{ color: "var(--muted)" }}>{r.plateNumber}</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>{t("routes.unassigned")}</span>
                        )}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: 12.5 }}>
                        {dateTime(r.generatedAt)}
                      </td>
                      <td>
                        <Link href={`/routes/${r.routeId}`} className="text-button">
                          {t("common.open")} <ArrowUpRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AgentPanel />
    </AppShell>
  );
}
