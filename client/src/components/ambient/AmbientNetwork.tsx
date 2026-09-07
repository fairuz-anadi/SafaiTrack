/**
 * Ambient bin-network canvas.
 *
 * This is not decorative noise — it is the product running as background art.
 * Each node is a bin: it fills over time, shifts colour through the same
 * healthy → watch → high → critical bands the dashboard uses, and emits a
 * pulse when it crosses into critical. Nearby bins link into faint route
 * lines, and a truck token runs a loop between the fullest ones.
 *
 * Interaction:
 *   move   — the cursor pushes bins aside and brightens the routes near it
 *   click  — a collection sweep expands from the pointer, emptying every bin
 *            it passes and flashing each one as it is served
 *
 * The canvas never receives pointer events (so it cannot block the UI);
 * it listens on the window and converts to local coordinates instead.
 */
import { useEffect, useRef } from "react";

interface Props {
  /** Overall opacity/energy, 0–1. Dashboards want ~0.4, hero sections 1. */
  intensity?: number;
  /** Palette for the surface it sits on. */
  tone?: "dark" | "light";
  /** Node-count multiplier. */
  density?: number;
  /** Draw the roaming truck token and its route. */
  showTruck?: boolean;
  className?: string;
}

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0–1 — the bin's fill level, drives colour exactly like the real app. */
  fill: number;
  rate: number;
  /** Countdown of a highlight flash, in frames. */
  flash: number;
  /** True once it has emitted its critical pulse, so it only fires once. */
  announced: boolean;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  /** A user-initiated sweep collects bins; an ambient pulse only decorates. */
  collects: boolean;
}

/** Matches FILL_BANDS in shared/types.ts. */
const BANDS = [
  { at: 0.85, light: "#ff715f", dark: "#ff8b7c" },
  { at: 0.7, light: "#f0b84a", dark: "#f7c86a" },
  { at: 0.5, light: "#68a5e8", dark: "#7fb6f0" },
  { at: 0, light: "#68ad34", dark: "#b7ef5d" },
];

const LINK_DIST = 132;
const MOUSE_RADIUS = 150;
/** Hard ceiling on nodes, whatever the viewport size. */
const MAX_NODES = 60;
/**
 * Hard ceiling on link strokes per frame. Each link is its own stroke call,
 * so an unbounded O(n^2) pass is the one thing here that could stutter on a
 * modest laptop. Capping it keeps the frame cost flat.
 */
const MAX_LINKS = 300;

export function AmbientNetwork({
  intensity = 1,
  tone = "light",
  density = 1,
  showTruck = true,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];
    let ripples: Ripple[] = [];
    let raf = 0;
    let running = true;

    // Pointer is tracked in canvas-local coordinates; -1 means "off canvas".
    const pointer = { x: -1, y: -1 };
    // Truck progress along the current leg of its tour.
    let truckLeg = 0;
    let truckT = 0;
    let tourIndex: number[] = [];

    const bandColor = (fill: number) => {
      const band = BANDS.find(b => fill >= b.at) ?? BANDS[BANDS.length - 1];
      return tone === "dark" ? band.dark : band.light;
    };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      const target = Math.round(
        Math.min(MAX_NODES, Math.max(18, (width * height) / 21000)) * density
      );
      nodes = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        // Slow drift — this should read as calm, not busy.
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: 1.7 + Math.random() * 2.4,
        fill: Math.random(),
        rate: 0.00018 + Math.random() * 0.00042,
        flash: 0,
        announced: Math.random() > 0.5,
      }));
      rebuildTour();
    }

    /** The truck visits the fullest handful of bins — a nearest-neighbour hop. */
    function rebuildTour() {
      const fullest = [...nodes]
        .map((n, i) => ({ i, fill: n.fill }))
        .sort((a, b) => b.fill - a.fill)
        .slice(0, 6)
        .map(x => x.i);
      tourIndex = fullest;
      truckLeg = 0;
      truckT = 0;
    }

    function addRipple(x: number, y: number, collects: boolean) {
      ripples.push({
        x,
        y,
        r: 0,
        maxR: collects ? Math.max(width, height) * 0.55 : 74,
        collects,
      });
      // Never let a burst of clicks pile up unbounded.
      if (ripples.length > 6) ripples.shift();
    }

    function step() {
      ctx!.clearRect(0, 0, width, height);

      // ── advance ripples, and let sweeps collect the bins they reach ──────
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += rp.collects ? 7.2 : 2.4;
        if (rp.r > rp.maxR) {
          ripples.splice(i, 1);
          continue;
        }
        const progress = rp.r / rp.maxR;
        const alpha = (1 - progress) * (rp.collects ? 0.5 : 0.3) * intensity;

        ctx!.beginPath();
        ctx!.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx!.strokeStyle =
          tone === "dark"
            ? `rgba(183,239,93,${alpha})`
            : `rgba(104,173,52,${alpha})`;
        ctx!.lineWidth = rp.collects ? 1.6 : 1.1;
        ctx!.stroke();

        if (rp.collects) {
          // The leading edge of the sweep empties whatever it touches.
          for (const n of nodes) {
            if (n.fill < 0.04) continue;
            const d = Math.hypot(n.x - rp.x, n.y - rp.y);
            if (Math.abs(d - rp.r) < 26) {
              n.fill = 0;
              n.announced = false;
              n.flash = 26;
              // A gentle outward nudge so the sweep feels physical.
              const push = 0.9 / Math.max(d, 1);
              n.vx += (n.x - rp.x) * push;
              n.vy += (n.y - rp.y) * push;
            }
          }
        }
      }

      // ── integrate nodes ─────────────────────────────────────────────────
      for (const n of nodes) {
        if (!reduceMotion) {
          n.x += n.vx;
          n.y += n.vy;
          // Drag, so click impulses settle back to a calm drift.
          n.vx *= 0.986;
          n.vy *= 0.986;
          n.fill = Math.min(1, n.fill + n.rate);
        }

        if (n.flash > 0) n.flash--;

        // Emit one pulse the moment a bin crosses into critical.
        if (!n.announced && n.fill >= 0.85) {
          n.announced = true;
          addRipple(n.x, n.y, false);
        }

        // Cursor pushes bins aside.
        if (pointer.x >= 0) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < MOUSE_RADIUS && d > 0.01) {
            const force = ((MOUSE_RADIUS - d) / MOUSE_RADIUS) * 0.42;
            n.vx += (dx / d) * force;
            n.vy += (dy / d) * force;
          }
        }

        // Wrap rather than bounce — no visible walls.
        if (n.x < -20) n.x = width + 20;
        if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20;
        if (n.y > height + 20) n.y = -20;

        // Cap velocity so a frantic cursor cannot fling nodes off screen.
        const speed = Math.hypot(n.vx, n.vy);
        if (speed > 2.6) {
          n.vx = (n.vx / speed) * 2.6;
          n.vy = (n.vy / speed) * 2.6;
        }
      }

      // ── route links ─────────────────────────────────────────────────────
      // Squared distance in the hot loop; no shadowBlur anywhere.
      const linkSq = LINK_DIST * LINK_DIST;
      ctx!.lineWidth = 0.85;
      let linksDrawn = 0;
      for (let i = 0; i < nodes.length && linksDrawn < MAX_LINKS; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length && linksDrawn < MAX_LINKS; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dsq = dx * dx + dy * dy;
          if (dsq > linkSq) continue;

          const closeness = 1 - Math.sqrt(dsq) / LINK_DIST;
          let alpha = closeness * 0.3 * intensity;

          // Routes near the cursor light up.
          if (pointer.x >= 0) {
            const mx = (a.x + b.x) / 2 - pointer.x;
            const my = (a.y + b.y) / 2 - pointer.y;
            const md = Math.hypot(mx, my);
            if (md < MOUSE_RADIUS) alpha += (1 - md / MOUSE_RADIUS) * 0.5 * intensity;
          }

          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.strokeStyle =
            tone === "dark"
              ? `rgba(183,239,93,${alpha * 0.75})`
              : `rgba(39,55,43,${alpha * 0.55})`;
          ctx!.stroke();
          linksDrawn++;
        }
      }

      // ── bins ────────────────────────────────────────────────────────────
      for (const n of nodes) {
        const color = bandColor(n.fill);
        const flashing = n.flash > 0;
        // A bin grows slightly as it fills — legible without reading colour.
        const radius = n.r * (0.85 + n.fill * 0.5) + (flashing ? 2.4 : 0);

        ctx!.globalAlpha = (flashing ? 1 : 0.55 + n.fill * 0.45) * intensity;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx!.fillStyle = color;
        ctx!.fill();

        // Critical bins carry a halo so the eye finds them.
        if (n.fill >= 0.85 || flashing) {
          ctx!.globalAlpha = 0.24 * intensity;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, radius + 5.5, 0, Math.PI * 2);
          ctx!.fillStyle = color;
          ctx!.fill();
        }
      }
      ctx!.globalAlpha = 1;

      // ── truck running its tour ──────────────────────────────────────────
      if (showTruck && !reduceMotion && tourIndex.length > 1) {
        const from = nodes[tourIndex[truckLeg % tourIndex.length]];
        const to = nodes[tourIndex[(truckLeg + 1) % tourIndex.length]];
        if (from && to) {
          truckT += 0.006;
          if (truckT >= 1) {
            truckT = 0;
            truckLeg++;
            // Serve the bin on arrival, then re-plan.
            to.fill = 0;
            to.announced = false;
            to.flash = 24;
            if (truckLeg % tourIndex.length === 0) rebuildTour();
          }
          // Ease so the truck slows into each stop.
          const t = truckT < 0.5 ? 2 * truckT * truckT : 1 - (-2 * truckT + 2) ** 2 / 2;
          const tx = from.x + (to.x - from.x) * t;
          const ty = from.y + (to.y - from.y) * t;

          ctx!.globalAlpha = 0.45 * intensity;
          ctx!.beginPath();
          ctx!.moveTo(from.x, from.y);
          ctx!.lineTo(to.x, to.y);
          ctx!.strokeStyle = tone === "dark" ? "#b7ef5d" : "#68ad34";
          ctx!.lineWidth = 1.5;
          ctx!.setLineDash([5, 6]);
          ctx!.stroke();
          ctx!.setLineDash([]);

          ctx!.globalAlpha = intensity;
          ctx!.beginPath();
          ctx!.arc(tx, ty, 4.2, 0, Math.PI * 2);
          ctx!.fillStyle = tone === "dark" ? "#b7ef5d" : "#17211e";
          ctx!.fill();
          ctx!.globalAlpha = 0.28 * intensity;
          ctx!.beginPath();
          ctx!.arc(tx, ty, 10, 0, Math.PI * 2);
          ctx!.fillStyle = tone === "dark" ? "#b7ef5d" : "#68ad34";
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }
      }

      if (running && !reduceMotion) raf = requestAnimationFrame(step);
    }

    // ── window listeners: react without blocking the UI ───────────────────
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointer.x = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height ? x : -1;
      pointer.y = pointer.x < 0 ? -1 : y;
    };

    const onLeave = () => {
      pointer.x = -1;
      pointer.y = -1;
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
      addRipple(x, y, true);
    };

    // Pause off-screen and in background tabs — this must never cost a demo
    // its frame rate.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    if (reduceMotion) step();
    else raf = requestAnimationFrame(step);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intensity, tone, density, showTruck]);

  return <canvas ref={canvasRef} className={`ambient-canvas ${className ?? ""}`} aria-hidden="true" />;
}
