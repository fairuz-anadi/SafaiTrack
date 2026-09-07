/**
 * A photo slot that is safe to ship empty.
 *
 * Photographs are the one asset this project cannot generate for itself, and
 * borrowing them off an image search is a real risk: the competition rulebook
 * lists copied material as a disqualification criterion, and a remote image
 * would also break the offline demo.
 *
 * So each slot renders an original illustration by default and swaps to a real
 * photograph the moment one is dropped into `client/public/images/`. Nothing
 * breaks if the file is missing, and nothing is borrowed if it never arrives.
 */
import { useState, type ReactNode } from "react";

export type SceneName = "overflow" | "route" | "report" | "collected";

interface Props {
  /** File under `client/public/images/`, e.g. "bin-overflow.jpg". */
  src?: string;
  alt: string;
  /** Illustration shown until a real photograph is supplied. */
  scene: SceneName;
  caption?: ReactNode;
  className?: string;
}

export function Figure({ src, alt, scene, caption, className }: Props) {
  // `failed` covers the case where a filename is set but the file is absent.
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(src) && !failed;

  return (
    <figure className={`app-figure ${className ?? ""}`}>
      <div className="figure-frame">
        {showPhoto ? (
          <img
            src={`/images/${src}`}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <Scene name={scene} />
        )}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/* ─────────────────────────  ORIGINAL ILLUSTRATIONS  ─────────────────────── */
/* Drawn in the project palette so a slot with no photograph still reads as a
   deliberate piece of the design rather than a missing asset. */

function Scene({ name }: { name: SceneName }) {
  switch (name) {
    case "overflow":
      return <OverflowScene />;
    case "route":
      return <RouteScene />;
    case "report":
      return <ReportScene />;
    case "collected":
      return <CollectedScene />;
  }
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
