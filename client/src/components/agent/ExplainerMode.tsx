/**
 * Explainer Mode: the dashboard's opt-in explanation state.
 *
 * The dashboard stays a dashboard. When a number is confusing the reader turns this on,
 * clicks the number, and asks about it in the assistant they already use. Selecting only
 * establishes context — nothing is generated until a question is actually asked.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DashboardFocus } from "@shared/briefings";

export interface ExplainerSelection {
  /** Identifier only. The server looks up what this element currently reads. */
  focus: DashboardFocus;
  label: string;
  value: string;
}

interface ExplainerValue {
  active: boolean;
  selection: ExplainerSelection | null;
  /** Bumped whenever the assistant should come to the front. */
  openSignal: number;
  hintSeen: boolean;
  enter: () => void;
  exit: () => void;
  select: (selection: ExplainerSelection) => void;
  clear: () => void;
}

const ExplainerContext = createContext<ExplainerValue | null>(null);

/** Null on pages that have nothing explainable, which is how the assistant knows to hide the toggle. */
export function useExplainer(): ExplainerValue | null {
  return useContext(ExplainerContext);
}

export function ExplainerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [selection, setSelection] = useState<ExplainerSelection | null>(null);
  const [openSignal, setOpenSignal] = useState(0);
  const [hintSeen, setHintSeen] = useState(false);

  const enter = useCallback(() => setActive(true), []);
  // Leaving must not strand a selected card in its selected styling.
  const exit = useCallback(() => {
    setActive(false);
    setSelection(null);
  }, []);
  const select = useCallback((next: ExplainerSelection) => {
    setSelection(next);
    setHintSeen(true);
    setOpenSignal(signal => signal + 1);
  }, []);
  const clear = useCallback(() => setSelection(null), []);

  const value = useMemo(
    () => ({ active, selection, openSignal, hintSeen, enter, exit, select, clear }),
    [active, selection, openSignal, hintSeen, enter, exit, select, clear],
  );
  return <ExplainerContext.Provider value={value}>{children}</ExplainerContext.Provider>;
}

const sameFocus = (a: DashboardFocus | undefined, b: DashboardFocus) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Marks a dashboard element as something SafaiTrack can explain. Outside Explainer Mode the
 * wrapper is inert, so whatever the card already did on click keeps working.
 */
export function Explainable({
  focus,
  label,
  value,
  children,
}: {
  focus: DashboardFocus;
  label: string;
  value: string;
  children: ReactNode;
}) {
  const explainer = useExplainer();
  const active = explainer?.active ?? false;
  const selected = active && sameFocus(explainer?.selection?.focus, focus);

  if (!active) return <div className="explainable">{children}</div>;
  return (
    <div
      className={`explainable is-active${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}, ${value}`}
      onClick={() => explainer?.select({ focus, label, value })}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        explainer?.select({ focus, label, value });
      }}
    >
      {children}
      <span className="explainable-cue" aria-hidden="true">✦</span>
    </div>
  );
}
