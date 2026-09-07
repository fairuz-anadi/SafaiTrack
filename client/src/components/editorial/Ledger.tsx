/**
 * Editorial companions to the live route card.
 *
 * Same register: warm paper, hairline rules, mono labels, leader dots. These
 * are for presenting figures rather than operating on them — the dashboard
 * keeps its own denser components.
 */
import type { ReactNode } from "react";

/* ── Ledger ───────────────────────────────────────────────────────────────── */

export interface LedgerRow {
  label: string;
  value: string;
  /** Tints the figure when a direction is meaningful. */
  trend?: "up" | "down";
}

export function LedgerCard({
  kicker,
  meta,
  rows,
}: {
  kicker: string;
  meta?: ReactNode;
  rows: LedgerRow[];
}) {
  return (
    <div className="ledger-card">
      <div className="ledger-head">
        <span>{kicker}</span>
        {meta && <span className="figure">{meta}</span>}
      </div>
      <div className="ledger-rows">
        {rows.map(r => (
          <div key={r.label}>
            <span className="lg-key">{r.label}</span>
            {/* Leader dots, the way a printed table sets them. */}
            <span className="lg-lead" aria-hidden="true" />
            <span className={`lg-val ${r.trend ?? ""}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Collection log ───────────────────────────────────────────────────────── */

export interface LogRow {
  key: string | number;
  /** Planned or actual arrival, already formatted. */
  time: string;
  sequence: number;
  name: string;
  sub?: string;
  fillPercent: number;
  done?: boolean;
}

export function LogCard({
  kicker,
  meta,
  rows,
  empty,
}: {
  kicker: string;
  meta?: ReactNode;
  rows: LogRow[];
  empty: string;
}) {
  return (
    <div className="log-card">
      <div className="ledger-head">
        <span>{kicker}</span>
        {meta && <span className="figure">{meta}</span>}
      </div>

      {rows.length === 0 ? (
        <p style={{ padding: "18px 0 20px", fontSize: 14, color: "#8a8474", margin: 0 }}>
          {empty}
        </p>
      ) : (
        <div className="log-rows">
          {rows.map(r => (
            <div
              className={`log-row ${r.done ? "done" : ""} ${!r.done && r.fillPercent >= 85 ? "alert" : ""}`}
              key={r.key}
            >
              <span className="log-time">{r.time}</span>
              <span className="log-seq">{r.done ? "✓" : r.sequence}</span>
              <span className="log-name">
                {r.name}
                {r.sub && <small>{r.sub}</small>}
              </span>
              <span className={`log-fill ${r.fillPercent >= 85 ? "hot" : ""}`}>
                {Math.round(r.fillPercent)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
