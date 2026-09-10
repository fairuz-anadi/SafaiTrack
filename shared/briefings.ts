export type Language = "en" | "bn";
export type BriefingFeature = "route" | "dashboard";
export type RecommendedView = "critical_bins" | "complaints" | "forecasts" | "routes";
/** Section headings are written by the server; the model only picks which one a paragraph belongs under. */
export type SectionLabel = "attention" | "outlook" | "context" | "savings" | "selection" | "next_step";
export type CannotAnswerCode = "not_in_evidence" | "no_history" | "no_actual_savings" | "no_feasibility" | "no_prevention" | "no_optimality";

/**
 * What a reader selected on the dashboard. The client sends only the identifier;
 * the server looks up every value itself, so a stale card can never become evidence.
 */
export type DashboardMetric =
  | "bins_monitored"
  | "bins_need_attention"
  | "active_routes"
  | "avg_resolution"
  | "forecast_window"
  | "route_savings"
  | "complaints_open"
  | "ward_pressure";
export type DashboardFocus =
  | { type: "dashboard" }
  | { type: "metric"; metric: DashboardMetric }
  | { type: "bin"; binId: number };

export type Localized = Record<Language, string>;
export interface Evidence {
  value: string | number | boolean | null;
  kind: "observation" | "forecast" | "modeled" | "assumption" | "unknown";
  label: string;
}

/**
 * Everything an explanation is allowed to be built from. The server calculates it,
 * the model may only re-describe it, and the validator holds prose to it.
 */
export interface EvidenceSnapshot {
  feature: BriefingFeature;
  scope: { wardId: number | null; role: string };
  dataAsOf: string;
  /** Readable digest handed to the model. Never contains personal data or free database text. */
  context: Record<string, unknown>;
  /** Every value prose is allowed to quote, by ID. */
  evidence: Record<string, Evidence>;
  /** Every bin code, route code or ward name prose is allowed to name. */
  identities: string[];
  /** Plain-language caveats. The server owns the wording so prose never has to write a negation. */
  notes: Record<string, Localized>;
  /** Caveats the server appends whatever the model selects. */
  mandatoryNotes: string[];
  /** Technical detail, revealed only when the reader asks how a number is produced. */
  methodNotes: Record<Language, string[]>;
  /** Server-rendered figures, so the headline numbers are never retyped by a model. */
  highlights: { value: Localized; label: Localized }[];
  /** Follow-up questions this snapshot can actually answer. */
  suggestedQuestions: Localized[];
  sectionLabels: SectionLabel[];
  allowedViews: RecommendedView[];
  /** False whenever no earlier snapshot exists, which forbids change and trend wording. */
  historyAvailable: boolean;
  /** The selected dashboard element, when the reader is asking about one thing rather than the view. */
  focus: { id: string; label: Localized; value: string } | null;
}

/** The shape a briefing takes once composed, by either the model or the deterministic writer. */
export interface ComposedBriefing {
  headline: string;
  summary: string;
  sections: { label: SectionLabel; text: string; evidenceIds: string[] }[];
  noteIds: string[];
  recommendedViews: RecommendedView[];
  cannotAnswer: CannotAnswerCode[];
}

export interface BriefingResponse {
  headline: string;
  summary: string;
  sections: { label: SectionLabel; heading: string; text: string }[];
  highlights: { value: string; label: string }[];
  notes: string[];
  cannotAnswer: string[];
  suggestedQuestions: string[];
  recommendedViews: RecommendedView[];
  methodNotes: string[];
  dataAsOf: string;
  /** Echoed back so the assistant can label what it just answered about. */
  focus: { id: string; label: string; value: string } | null;
  /** Diagnostics below this line are for logs and tests; the interface does not render them. */
  source: "claude" | "openai" | "deterministic";
  model: string | null;
  requestId: string;
  snapshotId: string;
  latencyMs: number;
  fallbackReason: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  evidence: Record<string, Evidence>;
}

export const SECTION_HEADINGS: Record<SectionLabel, Localized> = {
  attention: { en: "What needs attention", bn: "যেদিকে নজর দেওয়া দরকার" },
  outlook: { en: "What may happen next", bn: "সামনে যা হতে পারে" },
  context: { en: "Worth checking", bn: "যা দেখে নেওয়া ভালো" },
  savings: { en: "What the savings mean", bn: "সাশ্রয়ের অর্থ" },
  selection: { en: "Why these stops", bn: "এই স্টপগুলো কেন" },
  next_step: { en: "What I'd look at first", bn: "প্রথমে যা দেখবেন" },
};
