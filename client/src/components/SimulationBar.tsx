/**
 * Simulation clock controls.
 *
 * "Run a day" advances the world 24 in-world hours in a few seconds: bins
 * fill on their own curves, forecasts refit, and bins cross into critical.
 * It is how a judge sees the system behave rather than reading a screenshot.
 */
import { useState } from "react";
import { FastForward, RotateCcw, StepForward, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { clockTime } from "@/lib/format";

interface SimState {
  simClock: string;
  ticksElapsed: number;
  minutesPerTick: number;
}

interface TickResult {
  simClock: string;
  ticksElapsed: number;
  binsUpdated: number;
  overflowing: number;
  newlyCritical: { binCode: string; landmark: string; fillPercent: number }[];
}

export function SimulationBar({
  state,
  onAdvanced,
}: {
  state: SimState | null;
  onAdvanced: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TickResult | null>(null);

  const run = async (action: string, ticks?: number) => {
    setBusy(action);
    try {
      const res = await api.post<{ result?: TickResult }>("/simulation", { action, ticks });
      if (res.result) setLastResult(res.result);
      onAdvanced();
    } catch {
      /* the bar is a demo control; a failed tick is not worth a modal */
    } finally {
      setBusy(null);
    }
  };

  const hoursPerTick = (state?.minutesPerTick ?? 30) / 60;

  return (
    <div className="sim-bar">
      <div className="sim-clock">
        <Zap size={15} fill="currentColor" />
        <span>Simulation clock</span>
        <b>{state ? clockTime(state.simClock) : "—"}</b>
        <span style={{ opacity: 0.55 }}>· tick {state?.ticksElapsed ?? 0}</span>
      </div>

      <div className="sim-actions">
        <button onClick={() => void run("tick")} disabled={busy !== null}>
          {busy === "tick" ? <span className="spinner" /> : <StepForward size={14} />}
          +{hoursPerTick === 0.5 ? "30 min" : `${hoursPerTick}h`}
        </button>
        <button onClick={() => void run("fast_forward", 12)} disabled={busy !== null}>
          {busy === "fast_forward" ? <span className="spinner" /> : <FastForward size={14} />}
          Skip 6 hours
        </button>
        <button className="accent" onClick={() => void run("fast_forward", 48)} disabled={busy !== null}>
          {busy === "fast_forward" ? <span className="spinner" /> : <FastForward size={14} />}
          Run a full day
        </button>
        <button onClick={() => void run("reset")} disabled={busy !== null} title="Reset the clock">
          <RotateCcw size={14} />
        </button>
      </div>

      {lastResult && (
        <p className="sim-note">
          Advanced to tick {lastResult.ticksElapsed} · {lastResult.binsUpdated} bins updated ·{" "}
          {lastResult.overflowing} overflowing
          {lastResult.newlyCritical.length > 0 && (
            <>
              {" "}
              · {lastResult.newlyCritical.length} newly critical, worst:{" "}
              {lastResult.newlyCritical[0].binCode} ({lastResult.newlyCritical[0].landmark})
            </>
          )}
        </p>
      )}
      {!lastResult && (
        <p className="sim-note">
          Bins fill on their own learned rates with a morning and evening peak. Run a day to watch
          the network drift into crisis, then generate a route against it.
        </p>
      )}
    </div>
  );
}
