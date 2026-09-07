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
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
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
        <span>{t("sim.clock")}</span>
        <b>{state ? clockTime(state.simClock) : "—"}</b>
        <span style={{ opacity: 0.55 }}>
          · {t("sim.tick")} {state?.ticksElapsed ?? 0}
        </span>
      </div>

      <div className="sim-actions">
        <button onClick={() => void run("tick")} disabled={busy !== null}>
          {busy === "tick" ? <span className="spinner" /> : <StepForward size={14} />}
          +{hoursPerTick === 0.5 ? t("sim.step30") : `${hoursPerTick}h`}
        </button>
        <button onClick={() => void run("fast_forward", 12)} disabled={busy !== null}>
          {busy === "fast_forward" ? <span className="spinner" /> : <FastForward size={14} />}
          {t("sim.skip6")}
        </button>
        <button className="accent" onClick={() => void run("fast_forward", 48)} disabled={busy !== null}>
          {busy === "fast_forward" ? <span className="spinner" /> : <FastForward size={14} />}
          {t("sim.runDay")}
        </button>
        <button onClick={() => void run("reset")} disabled={busy !== null} title="Reset the clock">
          <RotateCcw size={14} />
        </button>
      </div>

      {lastResult && (
        <p className="sim-note">
          {t("sim.advancedTo")} {lastResult.ticksElapsed} · {lastResult.binsUpdated}{" "}
          {t("sim.binsUpdated")} · {lastResult.overflowing} {t("sim.overflowing")}
          {lastResult.newlyCritical.length > 0 && (
            <>
              {" "}
              · {lastResult.newlyCritical.length} {t("sim.newlyCritical")}{" "}
              {lastResult.newlyCritical[0].binCode} ({lastResult.newlyCritical[0].landmark})
            </>
          )}
        </p>
      )}
      {!lastResult && (
        <p className="sim-note">{t("sim.note")}</p>
      )}
    </div>
  );
}
