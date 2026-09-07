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
 *
 * The scan repeats whenever the container's subtree changes. A single scan at
 * mount is not enough: a section that fetches its own content renders nothing
 * on the first pass, so its `.reveal` element does not exist yet — it would
 * then arrive with the class, never be observed, and sit at `opacity: 0`
 * forever, leaving a tall blank gap in the page.
 *
 * `resetKey` re-runs the whole setup. The app shell keys its page container on
 * the current route, so the container node is replaced on every navigation and
 * the observers have to be rebuilt against the new one.
 */
export function useRevealOnScroll<T extends HTMLElement>(resetKey?: unknown) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // No observer means no reveal, and `.reveal` starts at `opacity: 0` — so a
    // browser without IntersectionObserver would render the page below the
    // hero as blank. Show everything instead of animating it.
    const reduced = prefersReduced() || !("IntersectionObserver" in window);

    /** Set the first time the observer reports anything at all. */
    let observerReported = false;

    const observer = reduced
      ? null
      : new IntersectionObserver(
          entries => {
            observerReported = true;
            for (const entry of entries) {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer?.unobserve(entry.target);
              }
            }
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
        );

    /** Flipped once we know the observer is not going to do its job. */
    let degraded = reduced;

    /** Marked on the element itself so a re-scan never re-binds it. */
    const bind = (el: HTMLElement) => {
      if (el.dataset.revealBound) return;
      el.dataset.revealBound = "1";
      if (observer && !degraded) observer.observe(el);
      else el.classList.add("is-visible");
    };

    const scan = () => root.querySelectorAll<HTMLElement>(".reveal").forEach(bind);
    scan();

    // React can mutate this subtree many times in a burst, so the re-scan is
    // coalesced. A timer rather than `requestAnimationFrame`: this is a DOM
    // read, it does not need to be frame-aligned, and rAF is suspended in a
    // tab that is not painting — which would leave a late-arriving section
    // unobserved and therefore invisible in exactly the case that matters.
    let timer = 0;
    const mutations = new MutationObserver(() => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        scan();
      }, 0);
    });
    mutations.observe(root, { childList: true, subtree: true });

    /*
     * Last resort. `.reveal` is `opacity: 0` until this hook says otherwise,
     * so anything that stops the observer working takes the whole page below
     * the hero with it — a far worse outcome than losing an animation.
     *
     * An IntersectionObserver reports on every element it is given as soon as
     * it is observed, intersecting or not. Silence after a second therefore
     * does not mean "nothing has scrolled into view yet", it means the
     * observer is not running: drop the animation and show the page.
     */
    const failsafe = window.setTimeout(() => {
      if (observerReported || degraded) return;
      // Sections that arrive later must not fall into the same hole, so this
      // latches rather than just sweeping the elements present right now.
      degraded = true;
      root.querySelectorAll<HTMLElement>(".reveal").forEach(el => el.classList.add("is-visible"));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(failsafe);
      mutations.disconnect();
      observer?.disconnect();
    };
  }, [resetKey]);

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
