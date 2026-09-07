/**
 * Safai Track brand.
 *
 * The mark is a smart bin with a signal arc — the product's whole thesis in
 * one glyph: an ordinary municipal bin that now reports. It is drawn rather
 * than borrowed from an icon set, so it is ours, and it holds together from
 * 16px in a browser tab up to a printed banner.
 *
 * The wordmark is deliberately two words. "SafaiTrack" run together reads as
 * a startup URL; "Safai Track" reads as a name — safai (সাফাই, cleaning) and
 * track, which is exactly what the system does.
 */

type Tone = "light" | "dark" | "mono";

interface MarkProps {
  size?: number;
  tone?: Tone;
  /** Draw the rounded badge behind the glyph. */
  badge?: boolean;
  className?: string;
}

/** Badge fill, glyph fill, accent — per surface. */
const PALETTE: Record<Tone, { badge: string; glyph: string; accent: string }> = {
  light: { badge: "#17211e", glyph: "#f7f8f3", accent: "#b7ef5d" },
  dark: { badge: "#b7ef5d", glyph: "#17211e", accent: "#17211e" },
  mono: { badge: "currentColor", glyph: "#fff", accent: "#fff" },
};

export function BrandMark({ size = 34, tone = "light", badge = true, className }: MarkProps) {
  const c = PALETTE[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label="Safai Track"
    >
      {badge && <rect width="40" height="40" rx="12" fill={c.badge} />}

      {/* Signal arcs — the bin reporting its own state. */}
      <path
        d="M25.4 10.6a8.6 8.6 0 0 1 6.1 6.1"
        stroke={c.accent}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M24.6 15.4a3.9 3.9 0 0 1 2.8 2.8"
        stroke={c.accent}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Lid, handle, body. */}
      <rect x="8.4" y="15.2" width="15.4" height="3.3" rx="1.65" fill={c.glyph} />
      <path
        d="M13.9 15.2v-1.5a1.5 1.5 0 0 1 1.5-1.5h1.4a1.5 1.5 0 0 1 1.5 1.5v1.5"
        stroke={c.glyph}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M10.1 19.9h12l-1.05 8.3a2.1 2.1 0 0 1-2.08 1.83h-5.74a2.1 2.1 0 0 1-2.08-1.83z"
        fill={c.glyph}
      />
      {/* Two fill lines — the bin is monitored, not just emptied. */}
      <path
        d="M13.6 23.1h5M14 26.2h4.2"
        stroke={c.badge}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={badge ? 0.85 : 0}
      />
    </svg>
  );
}

interface WordmarkProps {
  /** Font size of the wordmark in px. */
  size?: number;
  tone?: "ink" | "paper";
  className?: string;
}

/** "Safai Track" — two words, two weights. */
export function Wordmark({ size = 19, tone = "ink", className }: WordmarkProps) {
  return (
    <span
      className={`wordmark ${tone === "paper" ? "on-dark" : ""} ${className ?? ""}`}
      style={{ fontSize: size }}
    >
      {/* A real space character, not just a CSS gap — so screen readers,
          copy-paste and find-in-page all see two words. */}
      <span className="wm-safai">Safai</span>{" "}
      <span className="wm-track">Track</span>
    </span>
  );
}

interface LockupProps {
  size?: number;
  tone?: Tone;
  /** Small line under the wordmark. */
  tagline?: string | false;
  className?: string;
}

/** Mark + wordmark + optional tagline — the standard header lockup. */
export function BrandLockup({
  size = 34,
  tone = "light",
  tagline = "Dhaka City Operations",
  className,
}: LockupProps) {
  return (
    <span className={`brand-lockup-v2 ${className ?? ""}`}>
      <BrandMark size={size} tone={tone} />
      <span className="brand-text">
        <Wordmark size={size * 0.74} tone={tone === "dark" ? "paper" : "ink"} />
        {tagline && <small>{tagline}</small>}
      </span>
    </span>
  );
}

/**
 * The oversized brand statement used once on the landing page. Large enough
 * that the mark's construction is visible, which is the point of showing it.
 */
export function BrandStatement({
  kicker,
  meaning,
  tagline,
}: {
  kicker: string;
  meaning: string;
  tagline: string;
}) {
  return (
    <div className="brand-statement">
      <div className="brand-statement-mark">
        <BrandMark size={104} tone="dark" />
        <span className="brand-orbit" />
        <span className="brand-orbit two" />
      </div>

      <div className="brand-statement-copy">
        <p className="public-kicker">{kicker}</p>
        <div className="brand-statement-word">
          <span className="bs-safai">Safai</span>{" "}
          <span className="bs-track">Track</span>
        </div>
        <p className="brand-meaning">{meaning}</p>
        <p className="brand-tagline">{tagline}</p>
      </div>
    </div>
  );
}
