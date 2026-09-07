/**
 * Live bin map.
 *
 * Renders real Dhaka geography with Leaflet over OpenStreetMap tiles. If the
 * tiles cannot be reached — the likely case at a venue with unreliable wifi —
 * the component detects the failure and falls back to a coordinate-accurate
 * schematic drawn from the same data. Bin positions, route lines and the
 * relative geometry stay correct either way; only the street artwork is lost.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { binTone } from "@shared/types";
import { WifiOff } from "lucide-react";

export interface MapBin {
  binId: number;
  binCode: string;
  landmark: string;
  latitude: number;
  longitude: number;
  currentFillPercent: number;
}

export interface MapPath {
  points: { lat: number; lng: number; label?: string }[];
  color: string;
  dashed?: boolean;
  label: string;
}

interface Props {
  bins: MapBin[];
  paths?: MapPath[];
  depot?: { lat: number; lng: number } | null;
  disposal?: { lat: number; lng: number } | null;
  selectedBinId?: number | null;
  onSelectBin?: (bin: MapBin) => void;
  tall?: boolean;
}

/** Dhanmondi–Mohammadpur, the area every seeded ward sits inside. */
const DHAKA_CENTER: [number, number] = [23.7545, 90.3745];

function binIcon(fill: number, selected: boolean): L.DivIcon {
  const tone = binTone(fill);
  const size = selected ? 34 : 28;
  return L.divIcon({
    className: "",
    html: `<div class="bin-marker ${tone}${selected ? " selected" : ""}" style="width:${size}px;height:${size}px">${Math.round(fill)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function pointIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="depot-marker" title="${label}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/** Keeps the viewport framed on whatever is currently plotted. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export function BinMap({
  bins,
  paths = [],
  depot,
  disposal,
  selectedBinId,
  onSelectBin,
  tall,
}: Props) {
  const [tilesFailed, setTilesFailed] = useState(false);
  // A tile server that never answers produces no error event, so a timeout is
  // the only reliable way to notice a dead connection.
  const loadedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!loadedRef.current) setTilesFailed(true);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, []);

  const allPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = bins.map(b => [b.latitude, b.longitude]);
    for (const p of paths) for (const pt of p.points) pts.push([pt.lat, pt.lng]);
    if (depot) pts.push([depot.lat, depot.lng]);
    if (disposal) pts.push([disposal.lat, disposal.lng]);
    return pts;
  }, [bins, paths, depot, disposal]);

  return (
    <div className={`map-shell${tall ? " tall" : ""}`}>
      <MapContainer
        center={DHAKA_CENTER}
        zoom={14}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        {!tilesFailed && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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

        <FitBounds points={allPoints} />

        {paths.map((path, i) => (
          <Polyline
            key={`${path.label}-${i}`}
            positions={path.points.map(p => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: path.color,
              weight: path.dashed ? 3 : 4.5,
              opacity: path.dashed ? 0.55 : 0.9,
              dashArray: path.dashed ? "7 8" : undefined,
              lineJoin: "round",
            }}
          />
        ))}

        {depot && <Marker position={[depot.lat, depot.lng]} icon={pointIcon("Depot")} />}
        {disposal && (
          <Marker position={[disposal.lat, disposal.lng]} icon={pointIcon("Amin Bazar landfill")} />
        )}

        {bins.map(bin => (
          <Marker
            key={bin.binId}
            position={[bin.latitude, bin.longitude]}
            icon={binIcon(bin.currentFillPercent, selectedBinId === bin.binId)}
            eventHandlers={{ click: () => onSelectBin?.(bin) }}
          >
            <Popup>
              <strong style={{ fontSize: 13 }}>{bin.binCode}</strong>
              <br />
              {bin.landmark}
              <br />
              <span style={{ color: "#7c8682" }}>{bin.currentFillPercent}% full</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {tilesFailed && (
        <div className="map-offline-note">
          <WifiOff size={13} />
          <span>
            <b>Offline map</b> — street tiles unavailable, bin positions are exact
          </span>
        </div>
      )}
    </div>
  );
}
