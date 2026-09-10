/**
 * Driver view — deliberately mobile-first.
 *
 * A driver is holding a phone in a truck cab, not sitting at a desk. Big
 * targets, one decision per row, no sidebar.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  LogOut,
  MapPin,
  Navigation,
  Play,
} from "lucide-react";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { clockTime, duration } from "@/lib/format";

interface RouteRow {
  routeId: number;
  routeCode: string;
  wardName: string;
  status: string;
  totalDistanceKm: number;
  estimatedMinutes: number;
  optimizedStopCount: number;
  plateNumber: string | null;
}

interface Stop {
  binId: number;
  binCode: string;
  landmark: string;
  landmarkBn: string | null;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  plannedFillPercent: number;
  currentFillPercent: number;
  stopStatus: string;
  plannedArrival: string | null;
}

export default function DriverRoute() {
  const { user, logout } = useAuth();
  const { t, tn } = useI18n();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [active, setActive] = useState<RouteRow | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [busy, setBusy] = useState<number | "route" | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api.get<{ routes: RouteRow[] }>("/routes");
    setRoutes(res.routes);
    const current =
      res.routes.find(r => r.status === "in_progress") ??
      res.routes.find(r => r.status === "assigned") ??
      null;
    setActive(current);
    if (current) {
      const detail = await api.get<{ stops: Stop[] }>(`/routes/${current.routeId}`);
      setStops(detail.stops);
    } else {
      setStops([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    if (!active) return;
    setBusy("route");
    setError("");
    try {
      await api.post(`/routes/${active.routeId}/start`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the route");
    } finally {
      setBusy(null);
    }
  };

  const collect = async (stop: Stop) => {
    if (!active) return;
    setBusy(stop.binId);
    setError("");
    try {
      await api.post(`/routes/${active.routeId}/collect`, {
        binId: stop.binId,
        fillPercentAtCollection: stop.currentFillPercent,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this collection");
    } finally {
      setBusy(null);
    }
  };

  const collected = stops.filter(s => s.stopStatus === "collected").length;
  const progress = stops.length > 0 ? (collected / stops.length) * 100 : 0;

  return (
    <div className="driver-page">
      <header className="driver-top">
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}
        >
          <LiveBrandLockup size={32} tone="dark" tagline={t("driver.role")} popover={false} href={false} />
          <button
            onClick={() => void logout()}
            style={{
              background: "rgba(255,255,255,.1)",
              color: "#f3f7ef",
              padding: 9,
              borderRadius: 9,
              cursor: "pointer",
            }}
            aria-label={t("common.signOut")}
          >
            <LogOut size={16} />
          </button>
        </div>

        <p className="eyebrow">{user?.fullName.toUpperCase()}</p>
        <h1>{active ? active.routeCode : t("driver.noRoute")}</h1>

        {active && (
          <>
            <p style={{ color: "rgba(243,247,239,.66)", fontSize: 15.5, margin: "0 0 14px" }}>
              {active.wardName} · {active.optimizedStopCount}{" "}
              {tn(active.optimizedStopCount, "common.stopOne", "common.stops")} ·{" "}
              {active.totalDistanceKm} km ·{" "}
              {duration(active.estimatedMinutes)}
              {active.plateNumber && ` · ${active.plateNumber}`}
            </p>
            <div className="driver-progress">
              <i>
                <em style={{ width: `${progress}%` }} />
              </i>
              <b>
                {collected}/{stops.length}
              </b>
            </div>
          </>
        )}
      </header>

      {error && (
        <div className="auth-error" style={{ margin: "16px 16px 0" }}>
          {error}
        </div>
      )}

      {!active && (
        <div className="empty-state" style={{ paddingTop: 60 }}>
          <Navigation size={34} />
          <p>
            {t("driver.noRouteBody")}
          </p>
          {routes.length > 0 && (
            <p style={{ marginTop: 18, fontSize: 14 }}>
              {routes.filter(r => r.status === "completed").length} {t("driver.completedBefore")}
            </p>
          )}
        </div>
      )}

      {active && (
        <div className="driver-stops">
          {stops.map(stop => {
            const done = stop.stopStatus === "collected";
            return (
              <div className={`driver-stop ${done ? "done" : ""}`} key={stop.binId}>
                <div className="stop-seq">
                  {done ? <CheckCircle2 size={17} /> : stop.sequenceOrder}
                </div>
                <div className="stop-info">
                  <strong>{stop.landmarkBn ?? stop.landmark}</strong>
                  <span>
                    {stop.binCode} · {stop.currentFillPercent}% {t("driver.full")}
                    {stop.plannedArrival && ` · ETA ${clockTime(stop.plannedArrival)}`}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--muted)", padding: 6 }}
                  aria-label="Navigate"
                >
                  <MapPin size={17} />
                </a>
                <button
                  className="stop-action"
                  disabled={done || active.status !== "in_progress" || busy !== null}
                  onClick={() => void collect(stop)}
                >
                  {busy === stop.binId ? (
                    <span className="spinner" />
                  ) : done ? (
                    t("driver.done")
                  ) : (
                    t("driver.collected")
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {active && active.status === "assigned" && (
        <div className="driver-bar">
          <button className="primary-button" onClick={() => void start()} disabled={busy !== null}>
            {busy === "route" ? <span className="spinner" /> : <Play size={16} fill="currentColor" />}
            {t("routes.startRoute")}
          </button>
        </div>
      )}

      {active && active.status === "in_progress" && collected === stops.length && stops.length > 0 && (
        <div className="driver-bar">
          <span style={{ fontSize: 15.5, color: "var(--lime-deep)", fontWeight: 600 }}>
            <CheckCircle2 size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            {t("driver.routeComplete")} ({stops.length})
          </span>
          <ChevronRight size={17} style={{ color: "var(--muted)" }} />
        </div>
      )}
    </div>
  );
}
