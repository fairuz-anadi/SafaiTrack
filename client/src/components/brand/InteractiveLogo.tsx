/**
 * The Safai Track mark, made alive.
 *
 * Three layers of behaviour, each earning its keep:
 *
 *   · At rest it is exactly the static `BrandMark` — a logo that squirms
 *     unprompted is a distraction, so nothing moves until you approach it.
 *   · On hover the badge tilts toward the pointer in 3D, the lid lifts off
 *     the bin, and the two signal arcs sweep out. That is the product's
 *     thesis acted out: an ordinary bin that opens up and reports.
 *   · On click it pops — a ring burst leaves the mark, and a card springs
 *     open explaining what the name means and what the glyph is made of.
 *
 * The tilt is driven by two CSS custom properties written straight onto the
 * element from a pointermove handler. No React state per frame: re-rendering
 * a component sixty times a second to move a logo would be absurd.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { BrandMark, Wordmark } from "@/components/brand/Brand";
import { useI18n } from "@/lib/i18n";

type Tone = "light" | "dark" | "mono";

interface Props {
  size?: number;
  tone?: Tone;
  /** Open the brand card on click. Off inside dense chrome like the sidebar. */
  popover?: boolean;
  className?: string;
}

/** How far, in degrees, the badge leans at the very edge of the pointer range. */
const MAX_TILT = 15;

export function InteractiveLogo({ size = 34, tone = "light", popover = true, className }: Props) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Bumped on every click so each burst remounts and replays its animation. */
  const [burst, setBurst] = useState(0);

  const setTilt = useCallback((x: number, y: number) => {
    const el = hostRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", `${x.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${y.toFixed(2)}deg`);
  }, []);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // -1 … 1 across the box, from its centre.
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    // Y drives rotateX inverted: pointer above the centre tips the top back.
    setTilt(-ny * 2 * MAX_TILT, nx * 2 * MAX_TILT);
  };

  const handleLeave = () => setTilt(0, 0);

  const handleClick = () => {
    setBurst(n => n + 1);
    if (popover) setOpen(o => !o);
  };

  // Escape closes it, and so does a click anywhere else on the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div
      ref={hostRef}
      className={`logo-live ${open ? "open" : ""} ${className ?? ""}`}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ width: size, height: size }}
    >
      <button
        type="button"
        className="logo-live-btn"
        onClick={handleClick}
        aria-label={t("brand.markLabel")}
        aria-expanded={popover ? open : undefined}
      >
        <span className="logo-live-tilt">
          {/* Rings live behind the badge so they read as signal, not outline. */}
          <span className="logo-halo" aria-hidden="true" />
          <BrandMark size={size} tone={tone} className="logo-live-mark" />
          {/* The lid is redrawn on top so it can lift independently of the
              body. It matches the mark's own lid geometry exactly. */}
          <svg
            className="logo-live-lid"
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="8.4"
              y="15.2"
              width="15.4"
              height="3.3"
              rx="1.65"
              fill={tone === "dark" ? "#17211e" : "#f7f8f3"}
            />
            <path
              d="M13.9 15.2v-1.5a1.5 1.5 0 0 1 1.5-1.5h1.4a1.5 1.5 0 0 1 1.5 1.5v1.5"
              stroke={tone === "dark" ? "#17211e" : "#f7f8f3"}
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </span>

        {burst > 0 && (
          <span className="logo-burst" key={burst} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </button>

      {popover && open && (
        <div className="logo-card" role="dialog" aria-label={t("brand.markLabel")}>
          <div className="logo-card-top">
            <BrandMark size={46} tone="light" />
            <div>
              <Wordmark size={19} />
              <small>{t("brand.tagline")}</small>
            </div>
          </div>

          <p className="logo-card-meaning">{t("brand.meaning")}</p>

          {/* Reading the glyph back to the viewer: every part means something. */}
          <ul className="logo-card-parts">
            <li>
              <b>01</b>
              {t("brand.partArcs")}
            </li>
            <li>
              <b>02</b>
              {t("brand.partBin")}
            </li>
            <li>
              <b>03</b>
              {t("brand.partLines")}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

interface LockupProps {
  size?: number;
  tone?: Tone;
  tagline?: string | false;
  popover?: boolean;
  /** Where the wordmark navigates. Pass `false` for a non-linked lockup. */
  href?: string | false;
  className?: string;
}

/**
 * The header lockup with the live mark in place of the static one.
 *
 * The mark and the name do different jobs here, which is why this is not just
 * `BrandLockup` with a swapped glyph: the mark is a button that opens the
 * brand card, the name is the link home. Wrapping the whole lockup in an
 * anchor — as the static one is at every call site — would have put a button
 * inside a link, which is invalid and leaves the click target ambiguous.
 */
export function LiveBrandLockup({
  size = 34,
  tone = "light",
  tagline = "Dhaka City Operations",
  popover = true,
  href = "/",
  className,
}: LockupProps) {
  const text = (
    <>
      <Wordmark size={size * 0.56} tone={tone === "dark" ? "paper" : "ink"} />
      {tagline && <small>{tagline}</small>}
    </>
  );

  return (
    <div className={`brand-lockup-v2 live ${className ?? ""}`}>
      <InteractiveLogo size={size} tone={tone} popover={popover} />
      {href === false ? (
        <span className="brand-text">{text}</span>
      ) : (
        <Link href={href} className="brand-text brand-text-link">
          {text}
        </Link>
      )}
    </div>
  );
}
