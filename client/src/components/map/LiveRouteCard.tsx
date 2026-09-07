/**
 * Live route card — an editorial presentation of a route in flight.
 *
 * Deliberately not the interactive operations map: the tiles are desaturated
 * so the route reads first, stops carry numbered pins with pill labels, and a
 * legend explains the three marks. It is the view you would put on a wall or
 * a poster, driven by the same live data as everything else.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export interface RouteStopPin {
  binId: number;
  /** 1-based position in the run; drawn inside the square. */
  sequence: number;
  /** Short place name shown in the pill, e.g. "Dhanmondi 08". */
  label: string;
  lat: number;
  lng: number;
  /** Coral marks an overflow alert; lime is an ordinary collection stop. */
  alert?: boolean;
  /** Unlabelled stops render as a plain ring to keep the card readable. */
  minor?: boolean;
}

interface Props {
  /** Shown in the header, e.g. "DHK-08". */
  routeCode: string;
  stops: RouteStopPin[];
  /** Full path including depot and disposal, in draw order. */
  path: { lat: number; lng: number }[];
  className?: string;
}

/** Dhaka time, ticking. The card claims to be live, so it should be. */
function useDhakaClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dhaka",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function pinIcon(stop: RouteStopPin): L.DivIcon {
  if (stop.minor) {
    return L.divIcon({
      className: "",
      html: `<span class="route-dot${stop.alert ? " alert" : ""}"></span>`,
      iconSize: [11, 11],
      iconAnchor: [5.5, 5.5],
    });
  }
  // The label sits to the right of the square, so the anchor stays on the
  // square itself and the pill overflows without shifting the position.
  return L.divIcon({
    className: "",
    html: `<span class="route-pin">
        <span class="route-pin-num${stop.alert ? " alert" : ""}">${stop.sequence}</span>
        <span class="route-pin-label">${stop.label}</span>
      </span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FitPath({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [56, 74], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export function LiveRouteCard({ routeCode, stops, path, className }: Props) {
  const { t } = useI18n();
  const clock = useDhakaClock();
  const [tilesFailed, setTilesFailed] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!loadedRef.current) setTilesFailed(true);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, []);

  const bounds = useMemo<[number, number][]>(
    () => [
      ...path.map(p => [p.lat, p.lng] as [number, number]),
      ...stops.map(s => [s.lat, s.lng] as [number, number]),
    ],
    [path, stops]
  );

  return (
    <div className={`live-route-card ${className ?? ""}`}>
      <header className="lrc-head">
        <span className="lrc-title">
          <i className="lrc-live" />
          {t("live.routeLabel")} / {routeCode}
        </span>
        <span className="lrc-clock figure">{clock} BST</span>
      </header>

      <div className="lrc-map">
        <MapContainer
          center={[23.7545, 90.3745]}
          zoom={13}
          scrollWheelZoom={false}
          dragging={false}
          doubleClickZoom={false}
          zoomControl={false}
          attributionControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          {!tilesFailed && (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              eventHandlers={{
                load: () => {
                  loadedRef.current = true;
                },
                tileerror: () => setTilesFailed(true),
              }}
            />
          )}

          <FitPath points={bounds} />

          <Polyline
            positions={path.map(p => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: "#1d2b25",
              weight: 2.6,
              opacity: 0.92,
              dashArray: "1 9",
              lineCap: "round",
              lineJoin: "round",
            }}
          />

          {stops.map(s => (
            <Marker key={s.binId} position={[s.lat, s.lng]} icon={pinIcon(s)} interactive={false} />
          ))}
        </MapContainer>

        {tilesFailed && (
          <span className="lrc-offline">
            <WifiOff size={12} /> {t("live.offlineMap")}
          </span>
        )}
      </div>

      <footer className="lrc-legend">
        <span>
          <i className="lg-line" /> {t("live.legendRoute")}
        </span>
        <span>
          <i className="lg-dot alert" /> {t("live.legendAlert")}
        </span>
        <span>
          <i className="lg-dot" /> {t("live.legendStop")}
        </span>
      </footer>
    </div>
  );
}
