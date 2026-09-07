/** Full bin inventory with the live map and the overflow forecast queue. */
import { useEffect, useMemo, useState } from "react";
import { Boxes, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { BinMap } from "@/components/map/BinMap";
import { api } from "@/lib/api";
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
  const [bins, setBins] = useState<BinView[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [wards, setWards] = useState<WardRow[]>([]);
  const [wardFilter, setWardFilter] = useState<string>("");
  const [band, setBand] = useState<"all" | "critical" | "high" | "watch" | "healthy">("all");
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
    <AppShell title="Live bins" eyebrow="BIN NETWORK">
      <div className="filter-row">
        <select value={wardFilter} onChange={e => setWardFilter(e.target.value)}>
          <option value="">All wards</option>
          {wards.map(w => (
            <option key={w.wardId} value={w.wardId}>
              {w.name}
            </option>
          ))}
        </select>
        <div className="chip-row">
          {(["all", "critical", "high", "watch", "healthy"] as const).map(b => (
            <button key={b} className={`chip ${band === b ? "active" : ""}`} onClick={() => setBand(b)}>
              {b === "all" ? "All" : b[0].toUpperCase() + b.slice(1)}
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
          {refreshing ? <span className="spinner" /> : <RefreshCw size={14} />} Refit forecasts
        </button>
      </div>

      <section className="dashboard-grid">
        <div className="map-card panel-card padded">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">GEOGRAPHY</p>
              <h3>{visible.length} bins on the map</h3>
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
                <p className="section-kicker">PREDICTED OVERFLOW</p>
                <h3>Next 24 hours</h3>
              </div>
              <span className="soft-badge">{forecasts.length}</span>
            </div>
            <div style={{ maxHeight: 470, overflowY: "auto" }}>
              {forecasts.length === 0 && (
                <p className="empty-state">Nothing is projected to overflow within a day.</p>
              )}
              {forecasts.map(f => (
                <div className="forecast-row" key={f.binId}>
                  <div
                    className={`forecast-clock ${
                      f.hoursToOverflow <= 3 ? "imminent" : f.hoursToOverflow <= 8 ? "soon" : "later"
                    }`}
                  >
                    {hoursUntil(f.hoursToOverflow)}
                    <small>left</small>
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
            <p className="section-kicker">INVENTORY</p>
            <h3>All bins</h3>
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="empty-state">
            <Boxes size={30} />
            <p>No bins match this filter.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Landmark</th>
                  <th>Ward</th>
                  <th>Category</th>
                  <th className="num">Capacity</th>
                  <th className="num">Fill</th>
                  <th className="num">Rate</th>
                  <th className="num">Overflows in</th>
                  <th>Last emptied</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(b => (
                  <tr
                    key={b.binId}
                    onClick={() => setSelected(b.binId)}
                    style={{ cursor: "pointer" }}
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
                          fontSize: 12.5,
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
                    <td style={{ color: "var(--muted)", fontSize: 12.5 }}>
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
