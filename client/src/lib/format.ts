/** Shared display formatting. */

export function bdt(amount: number): string {
  return `৳${Math.round(amount).toLocaleString("en-BD")}`;
}

export function km(distance: number): string {
  return `${distance.toFixed(1)} km`;
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** "2h 14m" from a minute count. */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "12 min ago" / "3 hrs ago" / "2 days ago". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "≈4h 20m" from a fractional hour count, for overflow forecasts. */
export function hoursUntil(hours: number | null): string {
  if (hours === null) return "—";
  if (hours <= 0) return "now";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
}
