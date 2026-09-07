/**
 * A photo slot that is safe to ship empty.
 *
 * Photographs are the one asset this project cannot generate for itself, and
 * borrowing them off an image search is a real risk: the competition rulebook
 * lists copied material as a disqualification criterion, and a remote image
 * would also break the offline demo.
 *
 * So each slot draws an original illustration, and a real photograph is laid
 * over the top the moment one is dropped into `client/public/images/`. Nothing
 * breaks if the file is missing — the illustration was never removed — and
 * nothing is borrowed if it never arrives.
 */
import { useState, type ReactNode } from "react";

export type SceneName = "overflow" | "route" | "report" | "collected" | "bin" | "sorting";

interface Props {
  /** File under `client/public/images/`, e.g. "bin-overflow.jpg". */
  src?: string;
  alt: string;
  /** Illustration shown until a real photograph is supplied. */
  scene: SceneName;
  /** Accent for the `bin` scene — the waste stream's own colour. */
  tint?: string;
  caption?: ReactNode;
  className?: string;
}

export function Figure({ src, alt, scene, tint, caption, className }: Props) {
  /**
   * The illustration is the base layer and the photograph is painted over it
   * once it has actually decoded — rather than the photograph being the base
   * and the illustration a fallback swapped in on `error`.
   *
   * That ordering matters. Swapping on `error` leaves a broken-image frame on
   * screen for as long as the failure takes to arrive, which on a slow link is
   * plainly visible. Layering means the worst case is an illustration that
   * never gets covered, which is the intended empty state anyway.
   */
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <figure className={`app-figure ${className ?? ""}`}>
      <div className="figure-frame">
        <Scene name={scene} tint={tint} />
        {src && !failed && (
          <img
            className={`figure-photo ${loaded ? "is-loaded" : ""}`}
            src={`/images/${src}`}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={e => {
              // A server that answers a missing file with an HTML page rather
              // than a 404 can still fire `load`; a real image has dimensions.
              if (e.currentTarget.naturalWidth > 0) setLoaded(true);
              else setFailed(true);
            }}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/* ─────────────────────────  ORIGINAL ILLUSTRATIONS  ─────────────────────── */
/* Drawn in the project palette so a slot with no photograph still reads as a
   deliberate piece of the design rather than a missing asset. */

function Scene({ name, tint }: { name: SceneName; tint?: string }) {
  switch (name) {
    case "overflow":
      return <OverflowScene />;
    case "route":
      return <RouteScene />;
    case "report":
      return <ReportScene />;
    case "collected":
      return <CollectedScene />;
    case "bin":
      return <BinScene tint={tint ?? "#68ad34"} />;
    case "sorting":
      return <SortingScene />;
  }
}

/**
 * A single wheeled bin in one waste stream's colour.
 *
 * The tint is the `colorHex` the database stores against that stream, so the
 * illustration cannot drift out of step with the colour the rest of the app
 * uses for the same category.
 */
function BinScene({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 320 220" className="scene" role="img" aria-label="A collection bin">
      <rect width="320" height="220" fill="#f4f7ef" />
      {/* kerb */}
      <rect x="0" y="176" width="320" height="44" fill="#e9eee2" />
      <path d="M0 176h320" stroke="#dbe2d1" strokeWidth="2" />
      {/* soft ground shadow */}
      <ellipse cx="160" cy="180" rx="66" ry="9" fill="#17211e" opacity=".07" />

      {/* body */}
      <path d="M112 74h96l-9 96a10 10 0 0 1-10 9h-58a10 10 0 0 1-10-9z" fill={tint} />
      {/* the lit face, so the bin has a light source rather than reading flat */}
      <path d="M112 74h30l-7 105h-14a10 10 0 0 1-10-9z" fill="#fff" opacity=".16" />
      {/* lid */}
      <rect x="104" y="58" width="112" height="18" rx="9" fill={tint} />
      <rect x="104" y="58" width="112" height="7" rx="3.5" fill="#fff" opacity=".22" />
      {/* handle */}
      <path
        d="M138 58v-8a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8v8"
        stroke={tint}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      {/* wheels */}
      <circle cx="126" cy="182" r="12" fill="#2b3a33" />
      <circle cx="126" cy="182" r="4.5" fill="#8f9d93" />
      <circle cx="194" cy="182" r="12" fill="#2b3a33" />
      <circle cx="194" cy="182" r="4.5" fill="#8f9d93" />

      {/* stream badge on the body — the universal "use a bin" mark */}
      <circle cx="160" cy="122" r="24" fill="#fff" opacity=".92" />
      <path d="M154 112h12l-2 20a2 2 0 0 1-2 1.8h-4a2 2 0 0 1-2-1.8z" fill={tint} />
      <rect x="150" y="106" width="20" height="4.6" rx="2.3" fill={tint} />
      <path d="M157 106v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke={tint} strokeWidth="2.4" fill="none" />
    </svg>
  );
}

/**
 * The sorting yard: recovered material separated into streams.
 *
 * Drawn as objects rather than as a person at work. Every other scene in this
 * file is a street, a bin or a phone, and a flat-vector human among them would
 * read as clip art — which is the exact impression this whole component exists
 * to avoid. The three sacks carry the three non-hazardous stream colours, so
 * the illustration says which streams end up here without a caption.
 */
function SortingScene() {
  return (
    <svg viewBox="0 0 320 220" className="scene" role="img" aria-label="Recovered material sorted into streams">
      <rect width="320" height="220" fill="#f3efe9" />

      {/* Brick wall, blocked in rather than drawn course by course. */}
      <rect x="0" y="0" width="320" height="128" fill="#e7ded8" />
      <g stroke="#dccfc7" strokeWidth="1.4">
        <path d="M0 32h320M0 64h320M0 96h320" />
        <path d="M40 0v32M120 0v32M200 0v32M280 0v32" />
        <path d="M0 32v32M80 32v32M160 32v32M240 32v32M320 32v32" />
        <path d="M40 64v32M120 64v32M200 64v32M280 64v32" />
        <path d="M0 96v32M80 96v32M160 96v32M240 96v32M320 96v32" />
      </g>
      {/* Yard floor. */}
      <rect x="0" y="128" width="320" height="92" fill="#e4e9dd" />
      <path d="M0 128h320" stroke="#d3dbca" strokeWidth="2" />

      {/* Zone tag, stencilled on the wall the way a yard is signed. */}
      <rect x="112" y="20" width="96" height="26" rx="6" fill="#17211e" />
      <text x="160" y="37" textAnchor="middle" fill="#b7ef5d" fontSize="11" fontFamily="monospace">
        ZONE-5 YARD
      </text>

      {/* Three open sacks, one per stream that arrives here. */}
      <g>
        {/* plastic — blue */}
        <ellipse cx="62" cy="196" rx="34" ry="7" fill="#17211e" opacity=".07" />
        <path d="M40 128h44l-6 66a5 5 0 0 1-5 4.4H51a5 5 0 0 1-5-4.4z" fill="#68a5e8" />
        <path d="M40 128h44l-1.4 15H41.4z" fill="#8fc9f0" />
        <ellipse cx="62" cy="128" rx="22" ry="6" fill="#4d8ad0" />
        {/* bottles above the rim */}
        <rect x="50" y="106" width="9" height="20" rx="4" fill="#c8e2f8" transform="rotate(-14 54 116)" />
        <rect x="64" y="103" width="9" height="22" rx="4" fill="#dceefc" transform="rotate(11 68 114)" />
      </g>

      <g>
        {/* paper and general — green */}
        <ellipse cx="160" cy="200" rx="38" ry="8" fill="#17211e" opacity=".07" />
        <path d="M134 120h52l-7 74a5 5 0 0 1-5 4.6h-28a5 5 0 0 1-5-4.6z" fill="#68ad34" />
        <path d="M134 120h52l-1.6 16h-48.8z" fill="#8fca5c" />
        <ellipse cx="160" cy="120" rx="26" ry="7" fill="#4f8a26" />
        {/* flattened board stacked on top */}
        <rect x="141" y="96" width="38" height="9" rx="2" fill="#d9c19a" transform="rotate(-5 160 100)" />
        <rect x="146" y="88" width="30" height="8" rx="2" fill="#e8d5b4" transform="rotate(4 161 92)" />
      </g>

      <g>
        {/* metal — amber */}
        <ellipse cx="258" cy="196" rx="32" ry="7" fill="#17211e" opacity=".07" />
        <path d="M238 130h40l-5.4 64a5 5 0 0 1-5 4.6h-19.2a5 5 0 0 1-5-4.6z" fill="#f0b84a" />
        <path d="M238 130h40l-1.3 14h-37.4z" fill="#f7d18a" />
        <ellipse cx="258" cy="130" rx="20" ry="5.5" fill="#d19a24" />
        {/* cans above the rim */}
        <rect x="248" y="110" width="8" height="17" rx="3" fill="#fbe6bd" transform="rotate(-9 252 118)" />
        <rect x="260" y="112" width="8" height="16" rx="3" fill="#f7d18a" transform="rotate(7 264 120)" />
      </g>

      {/* Weighing scale: the yard pays by the kilo, which is why the stream
          has to be clean before it arrives. */}
      <rect x="12" y="150" width="26" height="6" rx="3" fill="#8b968c" />
      <path d="M25 150v-14" stroke="#8b968c" strokeWidth="3" />
      <circle cx="25" cy="132" r="7" fill="#fff" stroke="#8b968c" strokeWidth="2.5" />
      <path d="M25 132v-4" stroke="#8b968c" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Street level: a bin past capacity, waste spilling onto the footpath. */
function OverflowScene() {
  return (
    <svg viewBox="0 0 320 220" className="scene" role="img" aria-label="An overflowing bin">
      <rect width="320" height="220" fill="#fdf3f1" />
      {/* buildings */}
      <rect x="18" y="44" width="52" height="106" rx="4" fill="#f3ded9" />
      <rect x="78" y="62" width="40" height="88" rx="4" fill="#f7e6e2" />
      <rect x="232" y="52" width="60" height="98" rx="4" fill="#f3ded9" />
      <rect x="28" y="56" width="10" height="12" rx="2" fill="#fdf3f1" />
      <rect x="46" y="56" width="10" height="12" rx="2" fill="#fdf3f1" />
      <rect x="28" y="78" width="10" height="12" rx="2" fill="#fdf3f1" />
      <rect x="244" y="66" width="12" height="14" rx="2" fill="#fdf3f1" />
      <rect x="266" y="66" width="12" height="14" rx="2" fill="#fdf3f1" />
      {/* footpath */}
      <rect x="0" y="150" width="320" height="70" fill="#efe4e1" />
      <path d="M0 150h320" stroke="#e3d0cb" strokeWidth="2" />
      {/* spilled waste */}
      <ellipse cx="128" cy="168" rx="9" ry="5" fill="#ff715f" opacity=".45" />
      <ellipse cx="196" cy="172" rx="11" ry="6" fill="#ff715f" opacity=".35" />
      <ellipse cx="112" cy="180" rx="7" ry="4" fill="#f0b84a" opacity=".55" />
      <ellipse cx="212" cy="163" rx="6" ry="4" fill="#f0b84a" opacity=".45" />
      {/* the bin, lid ajar */}
      <path d="M136 104h48l-4 46a6 6 0 0 1-6 5.4h-28a6 6 0 0 1-6-5.4z" fill="#ff715f" />
      <rect x="132" y="96" width="56" height="9" rx="4.5" fill="#e0503c" />
      <rect x="140" y="84" width="40" height="8" rx="4" fill="#e0503c" transform="rotate(-11 160 88)" />
      {/* heap above the rim */}
      <ellipse cx="160" cy="90" rx="26" ry="10" fill="#ffb3a8" />
      <ellipse cx="148" cy="84" rx="9" ry="6" fill="#f0b84a" />
      <ellipse cx="170" cy="82" rx="8" ry="5" fill="#ffd7d0" />
      {/* fill readout */}
      <rect x="206" y="96" width="52" height="22" rx="11" fill="#17211e" />
      <text x="232" y="111" textAnchor="middle" fill="#ff8b7c" fontSize="12" fontFamily="monospace">
        118%
      </text>
    </svg>
  );
}

/** A truck part-way along an optimized route. */
function RouteScene() {
  return (
    <svg viewBox="0 0 320 220" className="scene" role="img" aria-label="A truck on an optimized route">
      <rect width="320" height="220" fill="#f2f8ea" />
      {/* road */}
      <path
        d="M-10 176c60 0 62-46 122-46s60 42 118 42 62-40 100-40"
        stroke="#dbe8cd"
        strokeWidth="26"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-10 176c60 0 62-46 122-46s60 42 118 42 62-40 100-40"
        stroke="#68ad34"
        strokeWidth="2.5"
        fill="none"
        strokeDasharray="8 9"
        strokeLinecap="round"
      />
      {/* stops */}
      <circle cx="52" cy="176" r="7" fill="#68ad34" stroke="#fff" strokeWidth="2.5" />
      <circle cx="150" cy="132" r="7" fill="#f0b84a" stroke="#fff" strokeWidth="2.5" />
      <circle cx="248" cy="172" r="7" fill="#ff715f" stroke="#fff" strokeWidth="2.5" />
      {/* truck */}
      <rect x="96" y="86" width="62" height="34" rx="5" fill="#17211e" />
      <path d="M158 96h24l16 16v8h-40z" fill="#2c3b34" />
      <circle cx="116" cy="126" r="9" fill="#17211e" />
      <circle cx="116" cy="126" r="3.6" fill="#8f9d93" />
      <circle cx="180" cy="126" r="9" fill="#17211e" />
      <circle cx="180" cy="126" r="3.6" fill="#8f9d93" />
      <rect x="104" y="94" width="18" height="12" rx="2" fill="#b7ef5d" />
      <rect x="164" y="100" width="12" height="9" rx="2" fill="#8fc9f0" />
      {/* saving badge */}
      <rect x="206" y="46" width="86" height="26" rx="13" fill="#17211e" />
      <text x="249" y="63" textAnchor="middle" fill="#b7ef5d" fontSize="12" fontFamily="monospace">
        −31% km
      </text>
    </svg>
  );
}

/** A resident filing a report from a phone. */
function ReportScene() {
  return (
    <svg viewBox="0 0 320 220" className="scene" role="img" aria-label="A resident reporting a bin">
      <rect width="320" height="220" fill="#eef5fd" />
      <circle cx="160" cy="112" r="78" fill="#e0edfb" />
      {/* phone */}
      <rect x="118" y="42" width="84" height="148" rx="14" fill="#17211e" />
      <rect x="125" y="54" width="70" height="124" rx="7" fill="#f7f8f3" />
      <rect x="150" y="47" width="20" height="4" rx="2" fill="#3b4a42" />
      {/* form rows */}
      <rect x="133" y="64" width="34" height="5" rx="2.5" fill="#c3cec6" />
      <rect x="133" y="78" width="54" height="15" rx="4" fill="#eaf3fd" />
      <rect x="138" y="83" width="26" height="5" rx="2.5" fill="#8fb7dc" />
      <rect x="133" y="100" width="54" height="15" rx="4" fill="#f2f9e8" />
      <rect x="138" y="105" width="34" height="5" rx="2.5" fill="#9ccf74" />
      <rect x="133" y="122" width="54" height="24" rx="4" fill="#f1f4ef" />
      {/* submit */}
      <rect x="133" y="152" width="54" height="17" rx="8.5" fill="#17211e" />
      <text x="160" y="164" textAnchor="middle" fill="#b7ef5d" fontSize="8" fontFamily="monospace">
        SEND
      </text>
      {/* SMS bubble — the no-smartphone path */}
      <rect x="212" y="70" width="82" height="40" rx="12" fill="#fff" stroke="#d5e4f4" strokeWidth="1.5" />
      <text x="253" y="88" textAnchor="middle" fill="#3f6f9e" fontSize="9" fontFamily="monospace">
        BIN W27-B001
      </text>
      <text x="253" y="101" textAnchor="middle" fill="#3f6f9e" fontSize="9" fontFamily="monospace">
        FULL
      </text>
      <path d="M212 100l-10 8 12 2z" fill="#fff" stroke="#d5e4f4" strokeWidth="1.5" />
      {/* signal */}
      <path d="M36 92a22 22 0 0 1 16-16" stroke="#68a5e8" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M40 106a11 11 0 0 1 8-8" stroke="#68a5e8" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The same street after collection. */
function CollectedScene() {
  return (
    <svg viewBox="0 0 320 220" className="scene" role="img" aria-label="A collected, empty bin">
      <rect width="320" height="220" fill="#f2f8ea" />
      <rect x="18" y="44" width="52" height="106" rx="4" fill="#dfeed0" />
      <rect x="78" y="62" width="40" height="88" rx="4" fill="#e9f4dd" />
      <rect x="232" y="52" width="60" height="98" rx="4" fill="#dfeed0" />
      <rect x="28" y="56" width="10" height="12" rx="2" fill="#f2f8ea" />
      <rect x="46" y="56" width="10" height="12" rx="2" fill="#f2f8ea" />
      <rect x="244" y="66" width="12" height="14" rx="2" fill="#f2f8ea" />
      <rect x="266" y="66" width="12" height="14" rx="2" fill="#f2f8ea" />
      {/* clean footpath */}
      <rect x="0" y="150" width="320" height="70" fill="#e6f0da" />
      <path d="M0 150h320" stroke="#d2e2c1" strokeWidth="2" />
      {/* bin, closed */}
      <path d="M136 106h48l-4 44a6 6 0 0 1-6 5.4h-28a6 6 0 0 1-6-5.4z" fill="#68ad34" />
      <rect x="132" y="97" width="56" height="9" rx="4.5" fill="#528c28" />
      <rect x="152" y="88" width="16" height="7" rx="3.5" fill="#528c28" />
      {/* tick */}
      <circle cx="206" cy="104" r="17" fill="#17211e" />
      <path d="M199 104l5 5 10-11" stroke="#b7ef5d" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* small leaf flourish */}
      <path d="M92 148c0-12 9-20 20-20 0 12-9 20-20 20z" fill="#a8d97e" />
    </svg>
  );
}
