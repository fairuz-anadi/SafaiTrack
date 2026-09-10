import { HTTPException } from "hono/http-exception";
import type { DashboardFocus, DashboardMetric, EvidenceSnapshot, Language, Localized } from "../../shared/briefings.js";
import { FILL_BANDS, type AuthUser } from "../../shared/types.js";
import { authorizedWard } from "./access.js";
import { readDashboard, type DashboardData } from "./dashboard-data.js";
import { readOperationalBins } from "./operational-data.js";

/** The technical account, shown only when a reader asks how a number is produced. */
export const dashboardMethodNotes: Record<Language, string[]> = {
  en: [
    "Fill levels may originate in the simulation or in citizen reports; this view is not independent sensor verification.",
    "Overflow projections are refitted from recent valid readings on every read. Missing, old or fill-inconsistent readings are excluded from future-risk counts, and bins already at 100% are counted separately as a present observation.",
    "Forecast confidence is a heuristic score derived from fit quality and sample size, not a calibrated probability.",
    "Savings are modeled comparisons between an optimized order and a fixed-order run over the same bins. This holds for routes already marked complete: no counterfactual fuel measurement exists.",
    "Complaint counts are resident reports by status and priority, not independently verified incidents.",
    "No previous dashboard snapshot is stored, so change, cause and trend cannot be established. Operational and wall clocks may differ.",
  ],
  bn: [
    "ভরাটের মাত্রা সিমুলেশন বা নাগরিকের প্রতিবেদন থেকে আসতে পারে; এই ভিউ স্বাধীন সেন্সর যাচাই নয়।",
    "প্রতিবার পড়ার সময় সাম্প্রতিক বৈধ রিডিং থেকে পূর্বাভাস নতুন করে বসানো হয়। অনুপস্থিত, পুরোনো বা বর্তমান ভরাটের সঙ্গে অসামঞ্জস্যপূর্ণ রিডিং ভবিষ্যৎ ঝুঁকির গণনায় থাকে না, আর 100% পূর্ণ বিন আলাদাভাবে বর্তমান পর্যবেক্ষণ হিসেবে গোনা হয়।",
    "পূর্বাভাসের আস্থা ফিটের মান ও নমুনার সংখ্যা থেকে পাওয়া হিউরিস্টিক স্কোর, নিশ্চিত সম্ভাবনা নয়।",
    "সাশ্রয় হলো একই বিনগুলোর উপর সাজানো ক্রম ও কোড-ক্রমে ঘোরার মধ্যে মডেলভিত্তিক তুলনা। সম্পন্ন হিসেবে চিহ্নিত রুটের ক্ষেত্রেও এটি প্রযোজ্য: প্রকৃত জ্বালানির তুলনামূলক পরিমাপ নেই।",
    "অভিযোগের সংখ্যা অবস্থা ও অগ্রাধিকার অনুযায়ী বাসিন্দাদের প্রতিবেদন, স্বাধীনভাবে যাচাই করা ঘটনা নয়।",
    "আগের কোনো ড্যাশবোর্ড স্ন্যাপশট সংরক্ষিত নেই, তাই পরিবর্তন, কারণ ও প্রবণতা প্রতিষ্ঠা করা যায় না। সিমুলেশন ও বাস্তব ঘড়ি আলাদা হতে পারে।",
  ],
};

/** Plain-language caveats. Prose never writes one of these, so it never has to phrase a negation. */
export const dashboardNotes: Record<string, Localized> = {
  estimates: {
    en: "Route savings shown here are planning estimates from the route comparison, not amounts measured after collection.",
    bn: "এখানে দেখানো রুটের সাশ্রয় রুট তুলনা থেকে পাওয়া পরিকল্পনার অনুমান, সংগ্রহের পরে মাপা পরিমাণ নয়।",
  },
  forecast_estimate: {
    en: "Bins in the outlook are an estimate from recent fill readings, so it is worth checking their latest levels.",
    bn: "আউটলুকে থাকা বিনগুলো সাম্প্রতিক ভরাটের রিডিং থেকে করা অনুমান, তাই সর্বশেষ মাত্রা দেখে নেওয়া ভালো।",
  },
  reports_not_verified: {
    en: "Complaints are resident reports and have not been independently verified.",
    bn: "অভিযোগগুলো বাসিন্দাদের প্রতিবেদন, স্বাধীনভাবে যাচাই করা হয়নি।",
  },
  no_history: {
    en: "There is no earlier snapshot to compare against, so this view cannot show what changed.",
    bn: "তুলনা করার মতো আগের কোনো স্ন্যাপশট নেই, তাই এই ভিউ কী বদলেছে তা দেখাতে পারে না।",
  },
  coverage: {
    en: "Some bins do not have recent enough readings to project from, so the outlook covers only part of this view.",
    bn: "কিছু বিনের রিডিং পূর্বাভাসের জন্য যথেষ্ট সাম্প্রতিক নয়, তাই আউটলুক এই ভিউয়ের একাংশ ঢাকে।",
  },
  simulated_data: {
    en: "Fill levels may come from the simulation or from resident reports rather than live sensors.",
    bn: "ভরাটের মাত্রা সরাসরি সেন্সরের বদলে সিমুলেশন বা বাসিন্দাদের প্রতিবেদন থেকেও আসতে পারে।",
  },
};

export function dashboardSnapshot(data: DashboardData, role: string, wardName: string | null = null): EvidenceSnapshot {
  const snapshot: EvidenceSnapshot = {
    feature: "dashboard",
    scope: { ...data.scope, role },
    dataAsOf: data.dataAsOf,
    context: {
      bins: data.bins, forecasting: data.forecasting, complaints: data.complaints, fleet: data.fleet,
      routes: data.routes, impact: data.impact, completedCollections: data.completedCollections, timeBasis: data.timeBasis,
    },
    evidence: {},
    identities: [...(wardName ? [wardName] : []), ...(data.scope.wardId ? [`Ward ${data.scope.wardId}`] : [])],
    notes: dashboardNotes,
    mandatoryNotes: [],
    methodNotes: structuredClone(dashboardMethodNotes),
    highlights: [],
    suggestedQuestions: [],
    sectionLabels: ["attention", "outlook", "context", "savings", "next_step"],
    allowedViews: ["critical_bins", "complaints", "forecasts", ...(role === "staff" ? (["routes"] as const) : [])],
    historyAvailable: false,
    focus: null,
  };
  const record = (id: string, value: number, kind: EvidenceSnapshot["evidence"][string]["kind"], label: string) => {
    snapshot.evidence[id] = { value, kind, label };
  };

  for (const group of ["bins", "forecasting", "complaints", "routes", "fleet"] as const) {
    for (const [key, value] of Object.entries(data[group])) {
      if (typeof value === "number") record(`${group}.${key}`, value, group === "forecasting" ? "forecast" : "observation", key);
    }
  }
  record("impact.routesScored", data.impact.routesScored, "modeled", "routes with a modeled comparison");
  record("impact.avgSavedPercent", data.impact.avgSavedPercent, "modeled", "average modeled distance reduction");
  record("impact.totalOptimizedKm", data.impact.totalOptimizedKm, "modeled", "planned distance across scored routes");
  record("impact.totalBaselineKm", data.impact.totalBaselineKm, "modeled", "fixed-order comparison distance");
  record("impact.plannedCost", data.impact.planned.modeledCostSavedBdt, "modeled", "planned modeled cost saving");
  record("impact.completedCost", data.impact.completedModeled.modeledCostSavedBdt, "modeled", "completed-route modeled cost saving");
  record("impact.plannedFuel", data.impact.planned.modeledFuelSavedLitres, "modeled", "planned modeled fuel saving");
  record("impact.completedRoutes", data.impact.completedModeled.routes, "modeled", "completed routes scored");
  record("completedCollections", data.completedCollections, "observation", "logged collections");
  // Band edges are system constants, recorded so prose can name them without recomputing anything.
  record("bins.criticalBandPercent", FILL_BANDS.critical, "assumption", "critical band edge");
  record("bins.fullPercent", 100, "assumption", "recorded as full");

  if (data.impact.routesScored > 0) snapshot.mandatoryNotes.push("estimates");
  if (data.forecasting.additionalAtRisk > 0) snapshot.mandatoryNotes.push("forecast_estimate");
  if (data.forecasting.staleForecastCount + data.forecasting.missingForecastCount > 0) snapshot.mandatoryNotes.push("coverage");

  const ask = (en: string, bn: string) => snapshot.suggestedQuestions.push({ en, bn });
  ask("What should I look at first?", "প্রথমে কী দেখা উচিত?");
  if (data.forecasting.additionalAtRisk > 0) ask("Which bins may fill up soon?", "কোন বিনগুলো শিগগিরই ভরে যেতে পারে?");
  if (data.complaints.open > 0) ask("What do the open complaints tell me?", "খোলা অভিযোগগুলো কী বলছে?");
  if (data.impact.routesScored > 0) ask("Are these savings actual?", "এই সাশ্রয় কি প্রকৃত?");
  ask("What does the outlook actually mean?", "আউটলুক আসলে কী বোঝায়?");

  return snapshot;
}

/**
 * One entry per selectable dashboard element: what to call it, what it currently reads,
 * the evidence an explanation of it may draw on, and the questions that evidence can answer.
 * Values come from `data`, never from the caller.
 */
const FOCUS: Record<DashboardMetric, (data: DashboardData) => {
  label: Localized;
  value: string;
  evidenceIds: string[];
  questions: Localized[];
}> = {
  bins_monitored: data => ({
    label: { en: "Bins monitored", bn: "পর্যবেক্ষণে থাকা বিন" },
    value: String(data.bins.total),
    evidenceIds: ["bins.total", "bins.healthy", "bins.watch", "bins.high", "bins.critical", "bins.avgFill"],
    questions: [
      { en: "What does this number cover?", bn: "এই সংখ্যাটি কী নিয়ে?" },
      { en: "How are these bins doing right now?", bn: "এই বিনগুলোর অবস্থা এখন কেমন?" },
    ],
  }),
  bins_need_attention: data => ({
    label: { en: "Need attention", bn: "নজর দেওয়া দরকার" },
    value: String(data.bins.critical),
    evidenceIds: ["bins.critical", "bins.total", "bins.overflowing", "bins.criticalBandPercent", "bins.avgFill", "fleet.availableTrucks", "complaints.open"],
    questions: [
      { en: "Why do these bins need attention?", bn: "এই বিনগুলোতে কেন নজর দরকার?" },
      { en: "Which should I look at first?", bn: "প্রথমে কোনগুলো দেখব?" },
      { en: "How is this number calculated?", bn: "এই সংখ্যাটি কীভাবে হিসাব হয়?" },
    ],
  }),
  active_routes: data => ({
    label: { en: "Active routes", bn: "চলমান রুট" },
    value: String(data.routes.active),
    evidenceIds: ["routes.active", "routes.total", "routes.completed", "routes.distanceKm", "fleet.availableTrucks"],
    questions: [
      { en: "What counts as an active route?", bn: "কোন রুটকে চলমান ধরা হয়?" },
      { en: "Why is this number low?", bn: "এই সংখ্যা কম কেন?" },
    ],
  }),
  avg_resolution: data => ({
    label: { en: "Average resolution", bn: "গড় নিষ্পত্তির সময়" },
    value: `${data.complaints.avgResolutionHours}h`,
    evidenceIds: ["complaints.avgResolutionHours", "complaints.resolved", "complaints.open", "complaints.total"],
    questions: [
      { en: "What does this time measure?", bn: "এই সময়টা কী মাপে?" },
      { en: "Which complaints are still open?", bn: "কোন অভিযোগগুলো এখনো খোলা?" },
      { en: "Is this good?", bn: "এটি কি ভালো?" },
    ],
  }),
  forecast_window: data => ({
    label: { en: "Overflow outlook", bn: "ভরে যাওয়ার আউটলুক" },
    value: String(data.forecasting.additionalAtRisk),
    evidenceIds: ["forecasting.additionalAtRisk", "forecasting.lookaheadHours", "forecasting.usableForecastCount", "forecasting.staleForecastCount", "forecasting.missingForecastCount", "bins.overflowing", "bins.total"],
    questions: [
      { en: "What does this outlook mean?", bn: "এই আউটলুক কী বোঝায়?" },
      { en: "How reliable is this estimate?", bn: "এই অনুমান কতটা নির্ভরযোগ্য?" },
      { en: "How is the forecast calculated?", bn: "পূর্বাভাস কীভাবে হিসাব হয়?" },
    ],
  }),
  route_savings: data => ({
    label: { en: "Distance saved", bn: "সাশ্রয় হওয়া দূরত্ব" },
    value: `${data.impact.avgSavedPercent}%`,
    evidenceIds: ["impact.avgSavedPercent", "impact.routesScored", "impact.totalOptimizedKm", "impact.totalBaselineKm", "impact.plannedCost", "impact.completedCost", "impact.completedRoutes"],
    questions: [
      { en: "Is this saving actual?", bn: "এই সাশ্রয় কি প্রকৃত?" },
      { en: "What is it compared against?", bn: "কীসের সঙ্গে তুলনা করা হয়?" },
      { en: "Why is this zero?", bn: "এটি শূন্য কেন?" },
    ],
  }),
  complaints_open: data => ({
    label: { en: "Open complaints", bn: "খোলা অভিযোগ" },
    value: String(data.complaints.open),
    evidenceIds: ["complaints.open", "complaints.urgent", "complaints.highPriority", "complaints.total", "complaints.resolved"],
    questions: [
      { en: "What do these complaints tell me?", bn: "এই অভিযোগগুলো কী বলছে?" },
      { en: "How many are urgent?", bn: "কতগুলো জরুরি?" },
    ],
  }),
  ward_pressure: data => ({
    label: { en: "Where the pressure is", bn: "চাপ কোথায়" },
    value: String(data.bins.critical),
    evidenceIds: ["bins.critical", "bins.total", "bins.overflowing", "complaints.open", "fleet.availableTrucks", "routes.active"],
    questions: [
      { en: "Where should I concentrate?", bn: "কোথায় মনোযোগ দেব?" },
      { en: "What should I look at first?", bn: "প্রথমে কী দেখব?" },
    ],
  }),
};

/** Narrows a verified snapshot to one element without letting anything unverified in. */
function applyFocus(snapshot: EvidenceSnapshot, data: DashboardData, focus: DashboardFocus): EvidenceSnapshot {
  if (focus.type === "dashboard") return snapshot;
  if (focus.type === "bin") return snapshot;
  const entry = FOCUS[focus.metric](data);
  const keep = new Set(entry.evidenceIds.filter(id => snapshot.evidence[id]));
  return {
    ...snapshot,
    focus: { id: focus.metric, label: entry.label, value: entry.value },
    evidence: Object.fromEntries(Object.entries(snapshot.evidence).filter(([id]) => keep.has(id))),
    suggestedQuestions: entry.questions,
  };
}

/** A single bin the reader picked off the map or the forecast list. */
async function binFocusSnapshot(snapshot: EvidenceSnapshot, wardId: number | undefined, binId: number): Promise<EvidenceSnapshot> {
  const { bins } = await readOperationalBins(wardId);
  const bin = bins.find(candidate => candidate.binId === binId);
  // Outside the caller's authorized ward is indistinguishable from absent, by design.
  if (!bin) throw new HTTPException(404, { message: "Bin not found in this view" });
  const evidence: EvidenceSnapshot["evidence"] = {
    "bin.fill": { value: bin.currentFillPercent, kind: "observation", label: `${bin.binCode} current fill` },
    "bins.criticalBandPercent": snapshot.evidence["bins.criticalBandPercent"],
    "bins.fullPercent": snapshot.evidence["bins.fullPercent"],
    "forecasting.lookaheadHours": snapshot.evidence["forecasting.lookaheadHours"],
  };
  if (bin.forecast.hoursToOverflow !== null) {
    evidence["bin.hoursToOverflow"] = { value: bin.forecast.hoursToOverflow, kind: "forecast", label: `${bin.binCode} hours to overflow` };
  }
  return {
    ...snapshot,
    context: { bin: { binCode: bin.binCode, currentFillPercent: bin.currentFillPercent, hoursToOverflow: bin.forecast.hoursToOverflow, readingsUsable: !bin.forecastStale && !bin.forecastMissing }, forecasting: snapshot.context.forecasting },
    evidence,
    identities: [...snapshot.identities, bin.binCode],
    focus: { id: "bin", label: { en: bin.binCode, bn: bin.binCode }, value: `${bin.currentFillPercent}%` },
    suggestedQuestions: [
      { en: "Why is this bin highlighted?", bn: "এই বিনটি আলাদা করে দেখানো কেন?" },
      { en: "Might this bin fill up soon?", bn: "এই বিনটি কি শিগগিরই ভরে যেতে পারে?" },
      { en: "How reliable is this estimate?", bn: "এই অনুমান কতটা নির্ভরযোগ্য?" },
    ],
    mandatoryNotes: bin.forecastStale || bin.forecastMissing ? ["coverage"] : bin.forecast.hoursToOverflow !== null ? ["forecast_estimate"] : [],
  };
}

export async function dashboardBriefingContext(user: AuthUser, wardId?: number, focus: DashboardFocus = { type: "dashboard" }) {
  const scoped = authorizedWard(user, wardId);
  const data = await readDashboard(scoped);
  const snapshot = dashboardSnapshot(data, user.role, data.wardName);
  if (focus.type === "bin") return binFocusSnapshot(snapshot, scoped, focus.binId);
  return applyFocus(snapshot, data, focus);
}
