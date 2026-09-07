/**
 * The route engine, shown rather than described.
 *
 * The optimization-mode toggle is not decorative: each press calls
 * `/api/route-preview`, which runs the real optimizer over live bin data and
 * returns a genuinely different tour. `Nearest neighbor` stops at the greedy
 * construction; `Shortest path` runs the 2-opt refinement over it. The
 * distance and stop order move because the algorithm moved.
 *
 * The map is a stylised projection of the real coordinates rather than a tile
 * map — it needs no network, and at this size the shape of the tour is the
 * point, not the streets underneath.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { bdt } from "@/lib/format";

type Mode = "shortest" | "nearest";

interface PreviewStop {
  binId: number;
  sequence: number;
  binCode: string;
  landmark: string;
  lat: number;
  lng: number;
  fillPercent: number;
  legKm: number;
}

interface Preview {
  mode: Mode;
  ward: { wardId: number; name: string; wardCode: string };
  algorithmName: string;
  stops: PreviewStop[];
  depot: { lat: number; lng: number };
  disposal: { lat: number; lng: number };
  totalDistanceKm: number;
  estimatedMinutes: number;
  priorityStops: number;
  totalStops: number;
  comparison: {
    baselineDistanceKm: number;
    distanceSavedPercent: number;
    wastedStopsAvoided: number;
    costSavedBdt: number;
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Normalise real coordinates into the panel's 0–100 box, north upward. */
function project(stops: PreviewStop[], depot: { lat: number; lng: number }) {
  const pts = [...stops.map(s => ({ lat: s.lat, lng: s.lng })), depot];
  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Guard against a degenerate span when every point shares a coordinate.
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  // 12% inset so nodes never touch the panel edge.
  return (lat: number, lng: number) => ({
    x: 12 + ((lng - minLng) / spanLng) * 76,
    y: 12 + ((maxLat - lat) / spanLat) * 76,
  });
}

export function RouteEngineSection() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("shortest");
  const [data, setData] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m: Mode) => {
    setBusy(true);
    try {
      setData(await api.get<Preview>(`/route-preview?mode=${m}`));
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(mode);
  }, [mode, load]);

  const nodes = useMemo(() => {
    if (!data) return [];
    const to = project(data.stops, data.depot);
    return data.stops.map(s => ({ ...s, ...to(s.lat, s.lng) }));
  }, [data]);

  const path = useMemo(() => nodes.map(n => `${n.x},${n.y}`).join(" "), [nodes]);

  const distanceAvoided = data
    ? Math.max(0, data.comparison.baselineDistanceKm - data.totalDistanceKm)
    : 0;

  return (
    <section className="engine-section" id="route-engine">
      <div className="engine-inner">
        {/* ── copy ─────────────────────────────────────────────────────── */}
        <div className="engine-copy">
          <p className="engine-marker">
            <i />
            <b>03</b>
            <span className="engine-rule" />
            {t("engine.kicker")}
          </p>

          <h2>
            {t("engine.title1")}
            <br />
            <em>{t("engine.title2")}</em>
          </h2>

          <p className="engine-body">{t("engine.body")}</p>

          <p className="engine-label">{t("engine.mode")}</p>
          <div className="engine-toggle" role="group" aria-label={t("engine.mode")}>
            {(["shortest", "nearest"] as Mode[]).map(m => (
              <button
                key={m}
                className={mode === m ? "on" : ""}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                disabled={busy}
              >
                {t(m === "shortest" ? "engine.modeShortest" : "engine.modeNearest")}
              </button>
            ))}
          </div>

          <div className="engine-stats">
            <div>
              <span className="engine-label">{t("engine.distanceAvoided")}</span>
              <strong className="figure">
                {distanceAvoided.toFixed(1)} <small>km</small>
              </strong>
              <small>
                {t("engine.vsFixed")} ({data?.comparison.baselineDistanceKm ?? "—"} km)
              </small>
            </div>
            <div>
              <span className="engine-label">{t("engine.priorityStops")}</span>
              <strong className="figure">
                {pad2(data?.priorityStops ?? 0)} / {pad2(data?.totalStops ?? 0)}
              </strong>
              <small>{t("engine.above80")}</small>
            </div>
          </div>

          <Link href="/login" className="engine-cta">
            {t("engine.cta")} <ArrowUpRight size={15} />
          </Link>
        </div>

        {/* ── priority map ─────────────────────────────────────────────── */}
        <div className="engine-panel">
          <div className="engine-panel-top">
            <span className="engine-chip">
              <i /> {data ? `${t("engine.dhakaNorth")} / ${data.ward.name}` : t("common.loading")}
            </span>
            <span className="engine-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>

          <p className="engine-panel-title">
            {t("engine.priorityMap")} /{" "}
            <span className="figure">{data ? `${data.totalStops} stops` : "—"}</span>
          </p>

          <div className={`engine-map ${busy ? "busy" : ""}`}>
            <span className="engine-compass">N</span>

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="engine-grid">
              {/* Faint road-like guides so the nodes have a ground to sit on. */}
              <path d="M-5 68 L105 44" />
              <path d="M18 -5 L34 105" />
              <path d="M-5 22 L105 34" />
              <path d="M72 -5 L64 105" />
            </svg>

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="engine-route">
              {nodes.length > 1 && <polyline points={path} />}
            </svg>

            {nodes.map(n => (
              <span
                key={n.binId}
                className={`engine-node ${n.fillPercent >= 85 ? "alert" : ""}`}
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
                title={`${n.binCode} · ${Math.round(n.fillPercent)}%`}
              >
                {pad2(n.sequence)}
              </span>
            ))}

            {data && (
              <>
                <span className="engine-tag" style={{ left: "8%", top: "20%" }}>
                  <b>{pad2(data.stops.filter(s => s.fillPercent >= 85).length)}</b>
                  {t("engine.tagOverflow")}
                </span>
                <span className="engine-tag" style={{ left: "58%", top: "62%" }}>
                  <b className="lime">{pad2(data.totalStops)}</b>
                  {t("engine.tagSequenced")}
                </span>
                <span className="engine-tag" style={{ left: "6%", top: "78%" }}>
                  <b>{pad2(data.comparison.wastedStopsAvoided)}</b>
                  {t("engine.tagAvoided")}
                </span>
              </>
            )}
          </div>

          <div className="engine-panel-foot">
            <div>
              <span className="engine-label">{t("engine.algorithm")}</span>
              <strong>{data?.algorithmName ?? "—"}</strong>
            </div>
            <span className="engine-ready">
              <i /> {busy ? t("engine.computing") : t("engine.ready")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
