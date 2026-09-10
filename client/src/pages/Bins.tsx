/** Full bin inventory with the live map and the overflow forecast queue. */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Boxes, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { BinMap } from "@/components/map/BinMap";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { hoursUntil, relativeTime } from "@/lib/format";
import { binTone, type BinView } from "@shared/types";

interface Forecast {
  binId: number;
  binCode: string;
  landmark: string;
  wardName: string;
  currentFillPercent: number;
  fillRatePctPerHour: number;
  hoursToOverflow: number;
  confidence: number;
  sampleSize: number;
}

interface WardRow {
  wardId: number;
  name: string;
}

export default function Bins() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [bins, setBins] = useState<BinView[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [wards, setWards] = useState<WardRow[]>([]);
  const [wardFilter, setWardFilter] = useState<string>("");
  const [band, setBand] = useState<"all" | "critical" | "high" | "watch" | "healthy">(new URLSearchParams(window.location.search).get("band") === "critical" ? "critical" : "all");
  const [selected, setSelected] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [b, f, w] = await Promise.all([
      api.get<{ bins: BinView[] }>(`/bins${wardFilter ? `?wardId=${wardFilter}` : ""}`),
      api.get<{ forecasts: Forecast[] }>(`/forecasts?hours=24${wardFilter ? `&wardId=${wardFilter}` : ""}`),
      api.get<{ wards: WardRow[] }>("/wards"),
    ]);
    setBins(b.bins);
    setForecasts(f.forecasts);
    setWards(w.wards);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardFilter]);

  const refreshForecasts = async () => {
    setRefreshing(true);
    try {
      await api.post("/forecasts/refresh");
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const visible = useMemo(
    () => (band === "all" ? bins : bins.filter(b => binTone(b.currentFillPercent) === band)),
    [bins, band]
  );

  return (
    <AppShell title={t("bins.title")} eyebrow={t("bins.eyebrow")}>
      <div className="filter-row">
        <select value={wardFilter} onChange={e => setWardFilter(e.target.value)}>
          <option value="">{t("bins.allWards")}</option>
          {wards.map(w => (
            <option key={w.wardId} value={w.wardId}>
              {w.name}
            </option>
          ))}
        </select>
        <div className="chip-row">
          {(["all", "critical", "high", "watch", "healthy"] as const).map(b => (
            <button key={b} className={`chip ${band === b ? "active" : ""}`} onClick={() => setBand(b)}>
              {b === "all"
                ? t("common.all")
                : b === "critical"
                  ? t("common.critical")
                  : b === "high"
                    ? t("common.high")
                    : b === "watch"
                      ? t("common.watch")
                      : t("common.healthy")}
              {b !== "all" && (
                <span style={{ marginLeft: 5, opacity: 0.75 }}>
                  {bins.filter(x => binTone(x.currentFillPercent) === b).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          className="ghost-button"
          style={{ marginLeft: "auto" }}
          onClick={() => void refreshForecasts()}
          disabled={refreshing}
        >
          {refreshing ? <span className="spinner" /> : <RefreshCw size={14} />} {t("bins.refit")}
        </button>
      </div>

      <section className="dashboard-grid">
        <div className="map-card panel-card padded">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("bins.geography")}</p>
              <h3>
                {visible.length} {t("bins.onMap")}
              </h3>
            </div>
          </div>
          <div style={{ height: 480 }}>
            <BinMap
              bins={visible.map(b => ({
                binId: b.binId,
                binCode: b.binCode,
                landmark: b.landmark,
                latitude: b.latitude,
                longitude: b.longitude,
                currentFillPercent: b.currentFillPercent,
              }))}
              selectedBinId={selected}
              onSelectBin={b => setSelected(b.binId)}
              tall
            />
          </div>
        </div>

        <div className="side-column">
          <div className="panel-card padded">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("bins.predictedOverflow")}</p>
                <h3>{t("bins.next24")}</h3>
              </div>
              <span className="soft-badge">{forecasts.length}</span>
            </div>
            <div style={{ maxHeight: 470, overflowY: "auto" }}>
              {forecasts.length === 0 && (
                <p className="empty-state">{t("bins.nothingSoon")}</p>
              )}
              {forecasts.map(f => (
                <div
                  className="forecast-row"
                  key={f.binId}
                  onClick={() => navigate(`/bins/${f.binId}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div
                    className={`forecast-clock ${
                      f.hoursToOverflow <= 3 ? "imminent" : f.hoursToOverflow <= 8 ? "soon" : "later"
                    }`}
                  >
                    {hoursUntil(f.hoursToOverflow)}
                    <small>{t("dash.left")}</small>
                  </div>
                  <div className="forecast-info">
                    <strong>{f.binCode}</strong>
                    <span>
                      {f.landmark} · {f.currentFillPercent}% · +{f.fillRatePctPerHour}%/h
                    </span>
                  </div>
                  <div className="confidence-bar">
                    <span>n={f.sampleSize}</span>
                    <i>
                      <em style={{ width: `${f.confidence * 100}%` }} />
                    </i>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="panel-card padded" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{t("bins.inventory")}</p>
            <h3>{t("bins.allBins")}</h3>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="empty-state">
            <Boxes size={30} />
            <p>{t("bins.noMatch")}</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("bins.code")}</th>
                  <th>{t("bins.landmark")}</th>
                  <th>{t("common.ward")}</th>
                  <th>{t("bins.category")}</th>
                  <th className="num">{t("bins.capacity")}</th>
                  <th className="num">{t("bins.fill")}</th>
                  <th className="num">{t("bins.rate")}</th>
                  <th className="num">{t("bins.overflowsIn")}</th>
                  <th>{t("bins.lastEmptied")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(b => (
                  <tr
                    key={b.binId}
                    onClick={() => navigate(`/bins/${b.binId}`)}
                    style={{ cursor: "pointer" }}
                    title={t("bins.detailKicker")}
                  >
                    <td>
                      <b>{b.binCode}</b>
                    </td>
                    <td>{b.landmark}</td>
                    <td>{b.wardName}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 14,
                        }}
                      >
                        <i
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: b.colorHex,
                            display: "inline-block",
                          }}
                        />
                        {b.categoryName}
                      </span>
                    </td>
                    <td className="num">{b.capacityLiters} L</td>
                    <td className="num">
                      <span className={`status-pill ${binToneClass(b.currentFillPercent)}`}>
                        {b.currentFillPercent}%
                      </span>
                    </td>
                    <td className="num">+{b.fillRatePctPerHour}%/h</td>
                    <td className="num">{hoursUntil(b.hoursToOverflow)}</td>
                    <td style={{ color: "var(--muted)", fontSize: 14 }}>
                      {relativeTime(b.lastCollectedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AgentPanel />
    </AppShell>
  );
}

function binToneClass(fill: number): string {
  const tone = binTone(fill);
  return tone === "critical" ? "coral" : tone === "high" ? "amber" : tone === "watch" ? "blue" : "green";
}
