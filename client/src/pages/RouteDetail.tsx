/**
 * Single route: the optimized path drawn on the real map against the fixed
 * schedule it replaces, the ordered stop list, and truck/driver assignment.
 */
import { useCallback, useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, MapPin, Play, Truck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { BinMap, type MapPath } from "@/components/map/BinMap";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { bdt, clockTime, duration, titleCase } from "@/lib/format";

interface RouteInfo {
  routeId: number;
  routeCode: string;
  wardName: string;
  status: string;
  algorithmName: string;
  totalDistanceKm: number;
  estimatedMinutes: number;
  assignedTruckId: number | null;
  assignedDriverId: number | null;
  plateNumber: string | null;
  driverName: string | null;
  depotLat: number;
  depotLng: number;
  disposalLat: number;
  disposalLng: number;
}

interface Stop {
  binId: number;
  binCode: string;
  landmark: string;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  plannedFillPercent: number;
  currentFillPercent: number;
  legDistanceKm: number;
  stopStatus: string;
  plannedArrival: string | null;
}

interface Comparison {
  baselineDistanceKm: number;
  optimizedDistanceKm: number;
  distanceSavedPercent: number;
  fuelSavedLitres: number;
  costSavedBdt: number;
  co2SavedKg: number;
  wastedStopsAvoided: number;
  overflowsPrevented: number;
}

interface Fleet {
  trucks: { truckId: number; plateNumber: string; status: string; capacityKg: number }[];
  drivers: { userId: number; fullName: string; shift: string; isAvailable: boolean }[];
}

export default function RouteDetail() {
  const [, params] = useRoute("/routes/:id");
  const { user } = useAuth();
  const routeId = Number(params?.id);

  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [truckId, setTruckId] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showBaseline, setShowBaseline] = useState(true);

  const load = useCallback(async () => {
    const [r, f] = await Promise.all([
      api.get<{ route: RouteInfo; stops: Stop[]; comparison: Comparison | null }>(
        `/routes/${routeId}`
      ),
      api.get<Fleet>("/fleet"),
    ]);
    setRoute(r.route);
    setStops(r.stops);
    setComparison(r.comparison);
    setFleet(f);
    setTruckId(prev => prev ?? f.trucks.find(t => t.status === "available")?.truckId ?? null);
    setDriverId(prev => prev ?? f.drivers.find(d => d.isAvailable)?.userId ?? null);
  }, [routeId]);

  useEffect(() => {
    if (routeId) void load();
  }, [routeId, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (!route) {
    return (
      <AppShell title="Route">
        <div className="loading-block">
          <span className="spinner" /> Loading route…
        </div>
      </AppShell>
    );
  }

  const depot = { lat: route.depotLat, lng: route.depotLng };
  const disposal = { lat: route.disposalLat, lng: route.disposalLng };

  const optimizedPath: MapPath = {
    label: "Optimized",
    color: "#68ad34",
    points: [depot, ...stops.map(s => ({ lat: s.latitude, lng: s.longitude })), disposal],
  };
  // The baseline visits the same bins in flat bin-code order — drawn dashed so
  // the difference in path shape is visible, not just the number.
  const baselinePath: MapPath = {
    label: "Fixed schedule",
    color: "#ff715f",
    dashed: true,
    points: [
      depot,
      ...[...stops]
        .sort((a, b) => a.binCode.localeCompare(b.binCode))
        .map(s => ({ lat: s.latitude, lng: s.longitude })),
      disposal,
    ],
  };

  const collected = stops.filter(s => s.stopStatus === "collected").length;

  return (
    <AppShell title={route.routeCode} eyebrow={`${route.wardName.toUpperCase()} · ${route.algorithmName}`}>
      {error && <div className="auth-error">{error}</div>}

      {comparison && (
        <div className="saving-banner">
          <div>
            <div className="big">
              {comparison.distanceSavedPercent.toFixed(1)}
              <small>%</small>
            </div>
            <p>
              shorter than the fixed schedule over the same ward — {comparison.optimizedDistanceKm}{" "}
              km instead of {comparison.baselineDistanceKm} km.
            </p>
          </div>
          <div className="saving-metrics">
            <div>
              <span>Fuel saved</span>
              <b>{comparison.fuelSavedLitres} L</b>
            </div>
            <div>
              <span>Cost avoided</span>
              <b>{bdt(comparison.costSavedBdt)}</b>
            </div>
            <div>
              <span>CO₂ avoided</span>
              <b>{comparison.co2SavedKg} kg</b>
            </div>
            <div>
              <span>Wasted stops skipped</span>
              <b>{comparison.wastedStopsAvoided}</b>
            </div>
          </div>
        </div>
      )}

      <section className="dashboard-grid">
        <div className="map-card panel-card padded">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">THE TWO ROUTES</p>
              <h3>Optimized against fixed schedule</h3>
            </div>
            <button className="ghost-button" onClick={() => setShowBaseline(v => !v)}>
              {showBaseline ? "Hide" : "Show"} baseline
            </button>
          </div>

          <div className="map-toolbar">
            <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <i
                  style={{
                    width: 18,
                    height: 3,
                    background: "#68ad34",
                    borderRadius: 2,
                    display: "inline-block",
                  }}
                />
                Optimized · {route.totalDistanceKm} km
              </span>
              {showBaseline && comparison && (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <i
                    style={{
                      width: 18,
                      height: 3,
                      background: "#ff715f",
                      borderRadius: 2,
                      display: "inline-block",
                      opacity: 0.7,
                    }}
                  />
                  Fixed schedule · {comparison.baselineDistanceKm} km
                </span>
              )}
            </div>
            <span className="map-updated">
              {duration(route.estimatedMinutes)} estimated · {stops.length} stops
            </span>
          </div>

          <div style={{ height: 460 }}>
            <BinMap
              bins={stops.map(s => ({
                binId: s.binId,
                binCode: s.binCode,
                landmark: s.landmark,
                latitude: s.latitude,
                longitude: s.longitude,
                currentFillPercent: s.currentFillPercent,
              }))}
              paths={showBaseline ? [baselinePath, optimizedPath] : [optimizedPath]}
              depot={depot}
              disposal={disposal}
              tall
            />
          </div>
        </div>

        <div className="side-column">
          <div className="panel-card padded">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">DISPATCH</p>
                <h3>{titleCase(route.status)}</h3>
              </div>
            </div>

            {route.status === "draft" && user?.role === "staff" && (
              <>
                <label className="auth-field">
                  <span>Truck</span>
                  <select value={truckId ?? ""} onChange={e => setTruckId(Number(e.target.value))}>
                    {fleet?.trucks
                      .filter(t => t.status === "available")
                      .map(t => (
                        <option key={t.truckId} value={t.truckId}>
                          {t.plateNumber} · {t.capacityKg} kg
                        </option>
                      ))}
                  </select>
                </label>
                <label className="auth-field">
                  <span>Driver</span>
                  <select value={driverId ?? ""} onChange={e => setDriverId(Number(e.target.value))}>
                    {fleet?.drivers
                      .filter(d => d.isAvailable)
                      .map(d => (
                        <option key={d.userId} value={d.userId}>
                          {d.fullName} · {d.shift}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="auth-submit"
                  disabled={busy || !truckId || !driverId}
                  onClick={() =>
                    void act(() => api.post(`/routes/${routeId}/assign`, { truckId, driverId }))
                  }
                >
                  {busy ? <span className="spinner" /> : <Truck size={16} />} Assign and dispatch
                </button>
              </>
            )}

            {route.status !== "draft" && (
              <div className="impact-rows" style={{ marginTop: 4 }}>
                <div>
                  <span>
                    <Truck size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Truck
                  </span>
                  <b>{route.plateNumber ?? "—"}</b>
                </div>
                <div>
                  <span>
                    <UserRound size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Driver
                  </span>
                  <b>{route.driverName ?? "—"}</b>
                </div>
                <div>
                  <span>Progress</span>
                  <b>
                    {collected} / {stops.length} collected
                  </b>
                </div>
              </div>
            )}

            {route.status === "assigned" && (
              <button
                className="auth-submit"
                style={{ marginTop: 14 }}
                disabled={busy}
                onClick={() => void act(() => api.post(`/routes/${routeId}/start`))}
              >
                {busy ? <span className="spinner" /> : <Play size={15} fill="currentColor" />} Start
                route
              </button>
            )}
          </div>

          <div className="panel-card padded">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">STOP SEQUENCE</p>
                <h3>{stops.length} stops in order</h3>
              </div>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 7 }}>
              {stops.map(s => (
                <div className={`driver-stop ${s.stopStatus === "collected" ? "done" : ""}`} key={s.binId}>
                  <div className="stop-seq">
                    {s.stopStatus === "collected" ? <CheckCircle2 size={16} /> : s.sequenceOrder}
                  </div>
                  <div className="stop-info">
                    <strong>{s.binCode}</strong>
                    <span>
                      {s.landmark} · {s.plannedFillPercent}% ·{" "}
                      {s.legDistanceKm} km
                      {s.plannedArrival && ` · ETA ${clockTime(s.plannedArrival)}`}
                    </span>
                  </div>
                  <MapPin size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <AgentPanel />
    </AppShell>
  );
}
