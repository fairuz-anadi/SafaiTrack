/** Analytics: fill trends, complaint mix, channel split, ward league table. */
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { titleCase } from "@/lib/format";

interface TrendPoint {
  bucket: string;
  avgFill: number;
  maxFill: number;
}
interface TypeRow {
  complaintType: string;
  total: number;
  resolved: number;
  avgHours: number;
}
interface ChannelRow {
  channel: string;
  total: number;
}
interface WardRow {
  wardId: number;
  name: string;
  binCount: number;
  avgFill: number;
  critical: number;
  overflowHours: number;
  complaintsTotal: number;
  complaintsOpen: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  web: "#68a5e8",
  sms: "#b7ef5d",
  ussd: "#9887e8",
  hotline: "#f0b84a",
};

export default function Analytics() {
  const { t } = useI18n();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [byType, setByType] = useState<TypeRow[]>([]);
  const [byChannel, setByChannel] = useState<ChannelRow[]>([]);
  const [wards, setWards] = useState<WardRow[]>([]);

  useEffect(() => {
    void (async () => {
      const [t, c, w] = await Promise.all([
        api.get<{ trend: TrendPoint[] }>("/analytics/fill-trend?hours=72"),
        api.get<{ byType: TypeRow[]; byChannel: ChannelRow[] }>("/analytics/complaints"),
        api.get<{ wards: WardRow[] }>("/analytics/wards"),
      ]);
      setTrend(t.trend);
      setByType(c.byType);
      setByChannel(c.byChannel);
      setWards(w.wards);
    })();
  }, []);

  const trendData = trend.map(p => ({
    time: p.bucket.slice(11, 16),
    "Average fill": p.avgFill,
    "Fullest bin": p.maxFill,
  }));

  const smsShare =
    byChannel.length > 0
      ? Math.round(
          (byChannel
            .filter(c => c.channel === "sms" || c.channel === "ussd")
            .reduce((s, c) => s + c.total, 0) /
            byChannel.reduce((s, c) => s + c.total, 0)) *
            100
        )
      : 0;

  return (
    <AppShell title={t("an.title")} eyebrow={t("an.eyebrow")}>
      <div className="panel-card padded" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("an.fillTrend")}</p>
            <h3>{t("an.filled72")}</h3>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
          {t("an.trendNote")}
        </p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="fillAvg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#68ad34" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#68ad34" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillMax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff715f" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#ff715f" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 4" stroke="#e8ece5" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10.5, fill: "#7c8682" }}
                axisLine={{ stroke: "#e8ece5" }}
                tickLine={false}
                minTickGap={26}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#7c8682" }}
                axisLine={false}
                tickLine={false}
                unit="%"
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 11,
                  border: "1px solid #e8ece5",
                  fontSize: 12.5,
                  boxShadow: "0 10px 34px rgba(39,55,43,.09)",
                }}
              />
              <Area
                type="monotone"
                dataKey="Fullest bin"
                stroke="#ff715f"
                strokeWidth={1.6}
                fill="url(#fillMax)"
              />
              <Area
                type="monotone"
                dataKey="Average fill"
                stroke="#68ad34"
                strokeWidth={2.4}
                fill="url(#fillAvg)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="dashboard-grid">
        <div className="panel-card padded">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("an.complaintsKicker")}</p>
              <h3>{t("an.volumeByType")}</h3>
            </div>
          </div>
          <div style={{ height: 250, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byType.map(r => ({
                  name: titleCase(r.complaintType),
                  Filed: r.total,
                  Resolved: r.resolved,
                }))}
                margin={{ top: 6, right: 8, bottom: 4, left: -20 }}
              >
                <CartesianGrid strokeDasharray="3 4" stroke="#e8ece5" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10.5, fill: "#7c8682" }}
                  axisLine={{ stroke: "#e8ece5" }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "#7c8682" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 11, border: "1px solid #e8ece5", fontSize: 12.5 }}
                />
                <Bar dataKey="Filed" fill="#68a5e8" radius={[5, 5, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Resolved" fill="#68ad34" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("an.type")}</th>
                  <th className="num">{t("common.filed")}</th>
                  <th className="num">{t("common.resolved")}</th>
                  <th className="num">{t("an.avgResolution")}</th>
                </tr>
              </thead>
              <tbody>
                {byType.map(r => (
                  <tr key={r.complaintType}>
                    <td>{titleCase(r.complaintType)}</td>
                    <td className="num">{r.total}</td>
                    <td className="num">{r.resolved}</td>
                    <td className="num">{r.avgHours ? `${r.avgHours}h` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="side-column">
          <div className="panel-card padded">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("an.channelKicker")}</p>
                <h3>{t("an.howReach")}</h3>
              </div>
            </div>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byChannel.map(c => ({ name: c.channel.toUpperCase(), value: c.total }))}
                    dataKey="value"
                    innerRadius={46}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {byChannel.map(c => (
                      <Cell key={c.channel} fill={CHANNEL_COLORS[c.channel] ?? "#7c8682"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 11, border: "1px solid #e8ece5", fontSize: 12.5 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="coverage-list" style={{ marginTop: 4 }}>
              {byChannel.map(c => (
                <div key={c.channel}>
                  <span>
                    <i
                      className="ward-dot"
                      style={{ background: CHANNEL_COLORS[c.channel] ?? "#7c8682" }}
                    />
                    {c.channel.toUpperCase()}
                  </span>
                  <b>{c.total}</b>
                </div>
              ))}
            </div>
            <div className="coverage-footer">
              <span>
                <strong style={{ color: "var(--ink)" }}>{smsShare}%</strong>&nbsp;
                {t("an.withoutSmartphone")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="panel-card padded" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("an.leagueKicker")}</p>
            <h3>{t("an.pressureByWard")}</h3>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.ward")}</th>
                <th className="num">{t("common.bins")}</th>
                <th className="num">{t("an.avgFill")}</th>
                <th className="num">{t("common.critical")}</th>
                <th className="num">{t("an.overflowHours")}</th>
                <th className="num">{t("nav.complaints")}</th>
                <th className="num">{t("an.open")}</th>
              </tr>
            </thead>
            <tbody>
              {wards.map(w => (
                <tr key={w.wardId}>
                  <td>
                    <b>{w.name}</b>
                  </td>
                  <td className="num">{w.binCount}</td>
                  <td className="num">{w.avgFill}%</td>
                  <td className="num">
                    {w.critical > 0 ? (
                      <span className="status-pill coral">{w.critical}</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>0</span>
                    )}
                  </td>
                  <td className="num">{w.overflowHours}h</td>
                  <td className="num">{w.complaintsTotal}</td>
                  <td className="num">{w.complaintsOpen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AgentPanel />
    </AppShell>
  );
}
