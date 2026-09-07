/**
 * Baseline-versus-optimized proof.
 *
 * This screen exists to convert the project's central claim into an auditable
 * number. Every figure is computed from two routes over the same ward at the
 * same moment — the legacy fixed schedule, and the optimizer's plan — and the
 * methodology panel states each constant so a judge can check the arithmetic
 * rather than take a percentage on faith.
 */
import { useEffect, useState } from "react";
import { Fuel, Leaf, Route as RouteIcon, TrendingDown, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { useCountUp, usePointerGlow, useRevealOnScroll } from "@/hooks/useMotion";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { bdt, dateTime } from "@/lib/format";

interface Comparison {
  comparisonId: number;
  routeCode: string;
  wardName: string;
  computedAt: string;
  baselineDistanceKm: number;
  optimizedDistanceKm: number;
  distanceSavedPercent: number;
  baselineFuelLitres: number;
  optimizedFuelLitres: number;
  fuelSavedLitres: number;
  costSavedBdt: number;
  co2SavedKg: number;
  wastedStopsAvoided: number;
  overflowsPrevented: number;
  baselineStopCount: number;
  optimizedStopCount: number;
}

interface Constants {
  dieselPriceBdtPerLitre: number;
  co2KgPerLitreDiesel: number;
  avgSpeedKmh: number;
  minutesPerStop: number;
  collectionThresholdPercent: number;
}

interface Overview {
  impact: {
    routesScored: number;
    totalBaselineKm: number;
    totalOptimizedKm: number;
    avgSavedPercent: number;
    fuelSavedLitres: number;
    costSavedBdt: number;
    co2SavedKg: number;
    wastedStopsAvoided: number;
    annual: { runsPerYear: number; annualCostSavedBdt: number; annualCo2SavedTonnes: number };
  };
}

/** The headline saving, counted up so it lands rather than simply appearing. */
function SavingHeadline({ percent }: { percent: number }) {
  const counted = useCountUp(percent, 1200, 1);
  return (
    <div className="big">
      {counted}
      <small>%</small>
    </div>
  );
}

export default function Impact() {
  const [rows, setRows] = useState<Comparison[]>([]);
  const [constants, setConstants] = useState<Constants | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  const glowRef = usePointerGlow<HTMLDivElement>();
  const revealRef = useRevealOnScroll<HTMLDivElement>();

  useEffect(() => {
    void (async () => {
      const [imp, ov] = await Promise.all([
        api.get<{ comparisons: Comparison[]; constants: Constants }>("/analytics/impact"),
        api.get<Overview>("/analytics/overview"),
      ]);
      setRows(imp.comparisons);
      setConstants(imp.constants);
      setOverview(ov);
      setLoading(false);
    })();
  }, []);

  const totals = overview?.impact;
  const chartData = rows
    .slice(0, 8)
    .reverse()
    .map(r => ({
      name: r.routeCode.replace("R-", ""),
      Baseline: r.baselineDistanceKm,
      Optimized: r.optimizedDistanceKm,
    }));

  return (
    <AppShell title={t("impact.title")} eyebrow={t("impact.eyebrow")}>
      <h2 className="page-title">{t("impact.question")}</h2>
      <p className="page-sub">{t("impact.lead")}</p>

      {loading && (
        <div className="loading-block">
          <span className="spinner" /> {t("common.loading")}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="panel-card padded">
          <div className="empty-state">
            <RouteIcon size={32} />
            <p>{t("impact.noRoutes")}</p>
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && totals && (
        <>
          <div className="saving-banner ambient-host">
            <AmbientNetwork tone="dark" intensity={0.7} density={0.55} />
            <div>
              <SavingHeadline percent={totals.avgSavedPercent} />
              <p>
                {t("impact.lessDistance")} {totals.routesScored}.
              </p>
            </div>
            <div className="saving-metrics">
              <div>
                <span>{t("impact.fuelSaved")}</span>
                <b>{totals.fuelSavedLitres.toFixed(1)} L</b>
              </div>
              <div>
                <span>{t("dash.costAvoided")}</span>
                <b>{bdt(totals.costSavedBdt)}</b>
              </div>
              <div>
                <span>{t("dash.co2Avoided")}</span>
                <b>{totals.co2SavedKg.toFixed(1)} kg</b>
              </div>
              <div>
                <span>{t("impact.wastedStops")}</span>
                <b>{totals.wastedStopsAvoided}</b>
              </div>
            </div>
          </div>

          <div className="impact-hero reveal reveal-stagger" ref={revealRef}>
            <div className="impact-panel baseline lift glow">
              <h4>{t("impact.todayPractice")}</h4>
              <div className="headline">{totals.totalBaselineKm.toFixed(1)} km</div>
              <p className="sub">{t("impact.todayPracticeSub")}</p>
              <div className="impact-rows">
                <div>
                  <span>{t("impact.stopsMade")}</span>
                  <b>{rows.reduce((s, r) => s + r.baselineStopCount, 0)}</b>
                </div>
                <div>
                  <span>{t("impact.dieselBurned")}</span>
                  <b>{rows.reduce((s, r) => s + r.baselineFuelLitres, 0).toFixed(1)} L</b>
                </div>
                <div>
                  <span>
                    {t("impact.stopsUnder")} {constants?.collectionThresholdPercent}%
                  </span>
                  <b>{totals.wastedStopsAvoided}</b>
                </div>
              </div>
            </div>

            <div className="impact-panel optimized lift glow">
              <h4>{t("impact.oursTitle")}</h4>
              <div className="headline">{totals.totalOptimizedKm.toFixed(1)} km</div>
              <p className="sub">{t("impact.oursSub")}</p>
              <div className="impact-rows">
                <div>
                  <span>{t("impact.stopsMade")}</span>
                  <b>{rows.reduce((s, r) => s + r.optimizedStopCount, 0)}</b>
                </div>
                <div>
                  <span>{t("impact.dieselBurned")}</span>
                  <b>{rows.reduce((s, r) => s + r.optimizedFuelLitres, 0).toFixed(1)} L</b>
                </div>
                <div>
                  <span>{t("impact.criticalReached")}</span>
                  <b>{rows.reduce((s, r) => s + r.overflowsPrevented, 0)}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-card padded lift" style={{ marginBottom: 18 }}>
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("impact.routeByRoute")}</p>
                <h3>{t("impact.distanceBoth")}</h3>
              </div>
            </div>
            <div style={{ height: 260, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 8, bottom: 4, left: -14 }}>
                  <CartesianGrid strokeDasharray="3 4" stroke="#e8ece5" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 13, fill: "#7c8682" }}
                    axisLine={{ stroke: "#e8ece5" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 13, fill: "#7c8682" }}
                    axisLine={false}
                    tickLine={false}
                    unit=" km"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 11,
                      border: "1px solid #e8ece5",
                      fontSize: 14,
                      boxShadow: "0 10px 34px rgba(39,55,43,.09)",
                    }}
                    formatter={(v: number) => [`${v} km`, ""]}
                  />
                  <Legend wrapperStyle={{ fontSize: 13.5, paddingTop: 6 }} />
                  <Bar dataKey="Baseline" fill="#ff715f" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Optimized" fill="#68ad34" radius={[5, 5, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel-card padded lift" style={{ marginBottom: 18 }}>
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("impact.everyRoute")}</p>
                <h3>{t("impact.fullRecord")}</h3>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("nav.routes")}</th>
                    <th>{t("common.ward")}</th>
                    <th>{t("routes.generated")}</th>
                    <th className="num">Baseline</th>
                    <th className="num">Optimized</th>
                    <th className="num">Saved</th>
                    <th className="num">Fuel</th>
                    <th className="num">Cost</th>
                    <th className="num">CO₂</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.comparisonId}>
                      <td>
                        <b>{r.routeCode}</b>
                      </td>
                      <td>{r.wardName}</td>
                      <td style={{ color: "var(--muted)", fontSize: 14 }}>
                        {dateTime(r.computedAt)}
                      </td>
                      <td className="num">{r.baselineDistanceKm} km</td>
                      <td className="num">{r.optimizedDistanceKm} km</td>
                      <td className="num">
                        <b style={{ color: "var(--lime-deep)" }}>
                          {r.distanceSavedPercent.toFixed(1)}%
                        </b>
                      </td>
                      <td className="num">{r.fuelSavedLitres} L</td>
                      <td className="num">{bdt(r.costSavedBdt)}</td>
                      <td className="num">{r.co2SavedKg} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Scaling the measured per-route saving to a city-wide figure. */}
          <div className="stats-grid reveal-stagger" style={{ marginBottom: 18 }} ref={glowRef}>
            <div className="stat-card lift glow">
              <div className="stat-icon lime">
                <Wallet size={18} />
              </div>
              <div className="stat-content">
                <span>{t("impact.annualSaving")}</span>
                <strong>{bdt(totals.annual.annualCostSavedBdt)}</strong>
                <small className="muted">
                  {totals.annual.runsPerYear.toLocaleString()} {t("impact.wardRuns")}
                </small>
              </div>
            </div>
            <div className="stat-card lift glow">
              <div className="stat-icon violet">
                <Leaf size={18} />
              </div>
              <div className="stat-content">
                <span>{t("impact.annualCo2")}</span>
                <strong>{totals.annual.annualCo2SavedTonnes} t</strong>
                <small className="muted">{t("impact.avoidedAll")}</small>
              </div>
            </div>
            <div className="stat-card lift glow">
              <div className="stat-icon blue">
                <Fuel size={18} />
              </div>
              <div className="stat-content">
                <span>{t("impact.dieselPrice")}</span>
                <strong>৳{constants?.dieselPriceBdtPerLitre}/L</strong>
                <small className="muted">{t("impact.retailRate")}</small>
              </div>
            </div>
            <div className="stat-card lift glow">
              <div className="stat-icon coral">
                <TrendingDown size={18} />
              </div>
              <div className="stat-content">
                <span>{t("impact.benchmark")}</span>
                <strong>21.5%</strong>
                <small className="muted">{t("impact.pooledMean")}</small>
              </div>
            </div>
          </div>

          <div className="method-note">
            <strong>How these numbers are produced.</strong> The baseline is a fixed-schedule route
            that visits every active bin in the ward in static bin-code order — the paper route
            sheet the city runs today. The optimized route selects only bins at or above{" "}
            <code>{constants?.collectionThresholdPercent}%</code> fill (or forecast to overflow
            within the lookahead window), orders them with Dijkstra shortest paths plus a
            priority-weighted nearest-neighbour construction, then improves the tour with 2-opt.
            <br />
            <br />
            Straight-line distances are multiplied by a <code>1.35</code> road-detour factor, so
            kilometres are not flattered by crow-flies geometry. Fuel is{" "}
            <code>distance × the specific truck's litres/km</code>; cost is{" "}
            <code>fuel × ৳{constants?.dieselPriceBdtPerLitre}</code>; CO₂ is{" "}
            <code>fuel × {constants?.co2KgPerLitreDiesel} kg</code> (well-to-wheel diesel). Time
            assumes <code>{constants?.avgSpeedKmh} km/h</code> average speed in a dense ward and{" "}
            <code>{constants?.minutesPerStop} minutes</code> per bin serviced. The annual projection
            assumes one optimized run per ward per day and applies no additional efficiency gains.
          </div>
        </>
      )}

      <AgentPanel />
    </AppShell>
  );
}
