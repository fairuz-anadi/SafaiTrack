/** Truck and driver roster. */
import { useEffect, useState } from "react";
import { Truck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";

interface FleetData {
  trucks: {
    truckId: number;
    plateNumber: string;
    capacityKg: number;
    status: string;
    make: string | null;
    model: string | null;
    currentOdometerKm: number;
    fuelLitresPerKm: number;
    homeWardName: string | null;
  }[];
  drivers: {
    userId: number;
    fullName: string;
    phone: string | null;
    licenseNo: string;
    shift: string;
    isAvailable: boolean;
  }[];
}

const TRUCK_TONE: Record<string, string> = {
  available: "green",
  on_route: "amber",
  maintenance: "coral",
  retired: "blue",
};

export default function Fleet() {
  const [data, setData] = useState<FleetData | null>(null);

  useEffect(() => {
    api
      .get<FleetData>("/fleet")
      .then(setData)
      .catch(() => setData({ trucks: [], drivers: [] }));
  }, []);

  return (
    <AppShell title="Fleet" eyebrow="TRUCKS AND DRIVERS">
      <section className="dashboard-grid">
        <div className="panel-card padded">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">VEHICLES</p>
              <h3>{data?.trucks.length ?? 0} trucks</h3>
            </div>
            <span className="soft-badge">
              {data?.trucks.filter(t => t.status === "available").length ?? 0} available
            </span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Vehicle</th>
                  <th>Home ward</th>
                  <th className="num">Capacity</th>
                  <th className="num">Odometer</th>
                  <th className="num">Fuel use</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.trucks.map(t => (
                  <tr key={t.truckId}>
                    <td>
                      <b style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5 }}>
                        {t.plateNumber}
                      </b>
                    </td>
                    <td>
                      {t.make} {t.model}
                    </td>
                    <td>{t.homeWardName ?? "—"}</td>
                    <td className="num">{t.capacityKg.toLocaleString()} kg</td>
                    <td className="num">{Math.round(t.currentOdometerKm).toLocaleString()} km</td>
                    <td className="num">{t.fuelLitresPerKm} L/km</td>
                    <td>
                      <span className={`status-pill ${TRUCK_TONE[t.status] ?? "blue"}`}>
                        {titleCase(t.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.trucks.length === 0 && (
            <div className="empty-state">
              <Truck size={30} />
              <p>No trucks registered.</p>
            </div>
          )}
        </div>

        <div className="side-column">
          <div className="panel-card padded">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">CREW</p>
                <h3>{data?.drivers.length ?? 0} drivers</h3>
              </div>
              <span className="soft-badge">
                {data?.drivers.filter(d => d.isAvailable).length ?? 0} free
              </span>
            </div>
            <div className="activity-list">
              {data?.drivers.map(d => (
                <div className="activity-item" key={d.userId}>
                  <div className={`activity-icon ${d.isAvailable ? "lime" : "amber"}`}>
                    <UserRound size={15} />
                  </div>
                  <div>
                    <strong>{d.fullName}</strong>
                    <span>
                      {d.licenseNo} · {titleCase(d.shift)} shift
                      {d.phone && ` · ${d.phone}`}
                    </span>
                  </div>
                  <time>{d.isAvailable ? "Free" : "On route"}</time>
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
