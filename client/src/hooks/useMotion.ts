/** Small motion primitives shared across the UI. */
import { useEffect, useRef, useState } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts a number up to its target whenever the target changes.
 *
 * Stat tiles that snap from 0 to 26 read as a page load; ones that count feel
 * like live telemetry. Uses an ease-out so the last few digits settle.
 */
export function useCountUp(target: number, durationMs = 900, decimals = 0): string {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    if (prefersReduced()) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  useEffect(() => {
    fromRef.current = value;
    // Intentionally not reacting to `value` — this only snapshots the last
    // rendered figure so the next animation starts from where the eye left off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value.toFixed(decimals);
}

/**
 * Adds `is-visible` to an element the first time it scrolls into view, so CSS
 * can stagger a reveal. Returns a ref to attach to the container; every
 * descendant carrying `.reveal` is observed.
 */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (targets.length === 0) return;

    if (prefersReduced()) {
      targets.forEach(el => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/**
 * Tracks the pointer inside a container and publishes its position as the CSS
 * custom properties `--mx` / `--my` (percentages). Cards use these to move a
 * soft highlight under the cursor.
 */
export function usePointerGlow<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReduced()) return;

    let frame = 0;
    const onMove = (e: MouseEvent) => {
      // One update per frame — mousemove fires far faster than the compositor.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = (e.target as HTMLElement)?.closest<HTMLElement>(".glow");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
      });
    };

    root.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("mousemove", onMove);
    };
  }, []);

  return ref;
}
