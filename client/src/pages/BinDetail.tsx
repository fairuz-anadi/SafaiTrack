/**
 * One bin, in full: its position, its forecast, and the reading history the
 * forecast was fitted on.
 *
 * The chart is the honest part — it shows the actual timestamped readings
 * rather than a smoothed marketing curve, including the sharp drops where a
 * collection emptied the bin.
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Boxes, Gauge, Radio, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { BinMap } from "@/components/map/BinMap";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { dateTime, hoursUntil, relativeTime } from "@/lib/format";
import { binTone, type BinView } from "@shared/types";

interface Reading {
  binId: number;
  readingNo: number;
  recordedAt: string;
  fillLevelPercent: number;
  readingSource: string;
  isValid: boolean;
}

const SOURCE_TONE: Record<string, string> = {
  simulated: "blue",
  citizen: "violet",
  driver: "green",
  sensor: "lime",
};

export default function BinDetail() {
  const [, params] = useRoute("/bins/:id");
  const { t } = useI18n();
  const binId = Number(params?.id);
  const [bin, setBin] = useState<BinView | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!binId) return;
    setLoading(true);
    api
      .get<{ bin: BinView; readings: Reading[] }>(`/bins/${binId}`)
      .then(res => {
        setBin(res.bin);
        setReadings(res.readings);
      })
      .catch(() => setBin(null))
      .finally(() => setLoading(false));
  }, [binId]);

  if (loading) {
    return (
      <AppShell title={t("bins.detailKicker")}>
        <div className="loading-block">
          <span className="spinner" /> {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  if (!bin) {
    return (
      <AppShell title={t("bins.detailKicker")}>
        <div className="panel-card padded">
          <div className="empty-state">
            <Boxes size={30} />
            <p>{t("bins.noMatch")}</p>
            <Link href="/bins" className="text-button" style={{ marginTop: 14 }}>
              <ArrowLeft size={14} /> {t("bins.backToBins")}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const chartData = readings.map(r => ({
    time: r.recordedAt.slice(11, 16),
    full: r.recordedAt,
    fill: r.fillLevelPercent,
  }));

  const tone = binTone(bin.currentFillPercent);

  return (
    <AppShell title={bin.binCode} eyebrow={`${t("bins.detailKicker")} · ${bin.wardName}`}>
      <Link href="/bins" className="step-back" style={{ marginTop: 0 }}>
        <ArrowLeft size={14} /> {t("bins.backToBins")}
      </Link>

      <section className="stats-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card lift glow">
          <div className={`stat-icon ${tone === "critical" ? "coral" : tone === "high" ? "amber" : "lime"}`}>
            <Gauge size={18} strokeWidth={2.2} />
          </div>
          <div className="stat-content">
            <span>{t("dash.fillLevel")}</span>
            <strong>{bin.currentFillPercent}%</strong>
            <small className="muted">
              {bin.capacityLiters} L · {bin.categoryName}
            </small>
          </div>
        </div>

        <div className="stat-card lift glow">
          <div className="stat-icon violet">
            <TrendingUp size={18} strokeWidth={2.2} />
          </div>
          <div className="stat-content">
            <span>{t("bins.rate")}</span>
            <strong>+{bin.fillRatePctPerHour}%</strong>
            <small className="muted">{t("bins.perHour")}</small>
          </div>
        </div>

        <div className="stat-card lift glow">
          <div className="stat-icon coral">
            <Boxes size={18} strokeWidth={2.2} />
          </div>
          <div className="stat-content">
            <span>{t("bins.overflowsIn")}</span>
            <strong>{hoursUntil(bin.hoursToOverflow)}</strong>
            <small className="muted">
              {bin.forecastConfidence !== null
                ? `${Math.round(bin.forecastConfidence * 100)}% ${t("bins.confidence")}`
                : "—"}
            </small>
          </div>
        </div>

        <div className="stat-card lift glow">
          <div className="stat-icon blue">
            <Radio size={18} strokeWidth={2.2} />
          </div>
          <div className="stat-content">
            <span>{t("bins.lastEmptied")}</span>
            <strong style={{ fontSize: 22 }}>{relativeTime(bin.lastCollectedAt)}</strong>
            <small className="muted">
              {readings.length} {t("bins.onFile")}
            </small>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel-card padded lift">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("bins.readingHistory")}</p>
              <h3>{t("bins.recentReadings")}</h3>
            </div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="binFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#68ad34" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#68ad34" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="#e8ece5" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12.5, fill: "#7c8682" }}
                  axisLine={{ stroke: "#e8ece5" }}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 13, fill: "#7c8682" }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 11, border: "1px solid #e8ece5", fontSize: 14 }}
                  labelFormatter={(_, payload) =>
                    payload?.[0] ? dateTime(String(payload[0].payload.full)) : ""
                  }
                  formatter={(v: number) => [`${v}%`, t("bins.fill")]}
                />
                {/* The line the forecast is projecting towards. */}
                <ReferenceLine y={100} stroke="#ff715f" strokeDasharray="4 4" />
                <ReferenceLine y={85} stroke="#f0b84a" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="fill"
                  stroke="#68ad34"
                  strokeWidth={2.4}
                  fill="url(#binFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.6 }}>
            {t("bins.chartNote")}
          </p>
        </div>

        <div className="side-column">
          <div className="panel-card padded lift">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("common.location")}</p>
                <h3>{bin.landmark}</h3>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <BinMap
                bins={[
                  {
                    binId: bin.binId,
                    binCode: bin.binCode,
                    landmark: bin.landmark,
                    latitude: bin.latitude,
                    longitude: bin.longitude,
                    currentFillPercent: bin.currentFillPercent,
                  },
                ]}
                selectedBinId={bin.binId}
              />
            </div>
            <div className="impact-rows" style={{ marginTop: 14 }}>
              <div>
                <span>{t("common.ward")}</span>
                <b>{bin.wardName}</b>
              </div>
              <div>
                <span>{t("bins.category")}</span>
                <b>{bin.categoryName}</b>
              </div>
              <div>
                <span>{t("common.status")}</span>
                <b>{bin.operationalStatus}</b>
              </div>
            </div>
          </div>

          <div className="panel-card padded lift">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("bins.source")}</p>
                <h3>{readings.length}</h3>
              </div>
            </div>
            <div className="table-scroll" style={{ maxHeight: 300, overflowY: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("bins.recordedAt")}</th>
                    <th className="num">{t("bins.fill")}</th>
                    <th>{t("bins.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...readings].reverse().slice(0, 30).map(r => (
                    <tr key={`${r.binId}-${r.readingNo}`}>
                      <td style={{ fontSize: 14, color: "var(--muted)" }}>
                        {dateTime(r.recordedAt)}
                      </td>
                      <td className="num">
                        <b>{r.fillLevelPercent}%</b>
                      </td>
                      <td>
                        <span className={`status-pill ${SOURCE_TONE[r.readingSource] ?? "blue"}`}>
                          {r.readingSource}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <AgentPanel />
    </AppShell>
  );
}
