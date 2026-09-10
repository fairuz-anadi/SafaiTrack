import type { CannotAnswerCode, ComposedBriefing, EvidenceSnapshot, Language, SectionLabel } from "../../shared/briefings.js";
import { FILL_BANDS } from "../../shared/types.js";

export const unknownMessages: Record<CannotAnswerCode, Record<Language, string>> = {
  not_in_evidence: {
    en: "I can only describe what this view already records, and that question goes past it.",
    bn: "এই ভিউতে যা আছে কেবল তা-ই বলতে পারি; প্রশ্নটি তার বাইরে চলে যায়।",
  },
  no_history: {
    en: "There is no earlier snapshot saved, so I cannot say what moved or why.",
    bn: "আগের কোনো স্ন্যাপশট সংরক্ষিত নেই, তাই কী বদলেছে বা কেন, তা বলতে পারি না।",
  },
  no_actual_savings: {
    en: "Fuel and cost figures come from the route comparison, so I cannot report a saving measured after collection.",
    bn: "জ্বালানি ও খরচের হিসাব রুট তুলনা থেকে আসে, তাই সংগ্রহের পরে মাপা সাশ্রয় জানাতে পারি না।",
  },
  no_feasibility: {
    en: "Road conditions and vehicle limits are outside what this plan checks, so I cannot confirm the route will run as written.",
    bn: "রাস্তার পরিস্থিতি ও গাড়ির সীমা এই পরিকল্পনার হিসাবের বাইরে, তাই রুটটি লেখামতো চলবে কি না বলতে পারি না।",
  },
  no_prevention: {
    en: "Nothing here records what would have happened without this plan, so I cannot credit it with stopping an overflow.",
    bn: "এই পরিকল্পনা ছাড়া কী হতো তার কোনো রেকর্ড নেই, তাই উপচে পড়া থামানোর কৃতিত্ব এটিকে দিতে পারি না।",
  },
  no_optimality: {
    en: "The planner improves the order it finds rather than proving it is the best one, so I cannot call this route unbeatable.",
    bn: "পরিকল্পনাকারী যে ক্রম পায় সেটিকে উন্নত করে, সেরা প্রমাণ করে না; তাই এই রুটকে অপ্রতিদ্বন্দ্বী বলতে পারি না।",
  },
};

/** Question routing shared by the deterministic writer and the cannot-answer notice. */
const TOPIC = {
  savings: /sav|cost|fuel|money|real|actual|সাশ্র|খরচ|জ্বালানি|প্রকৃত/i,
  selection: /select|includ|chose|chosen|why|কেন|নির্বাচ|বাছ/i,
  order: /order|sequence|shorter|route better|ক্রম|ছোট|সংক্ষিপ্ত/i,
  forecast: /forecast|predict|risk|soon|confidence|পূর্বাভাস|ঝুঁকি|আস্থা|শিগগির/i,
  complaints: /complaint|report|resident|citizen|অভিযোগ|প্রতিবেদন|নাগরিক/i,
  change: /chang|trend|since|compare|বদল|পরিবর্ত|তুলনা|প্রবণতা/i,
  dispatch: /dispatch|driver|truck|before|send|পাঠা|চালক|ট্রাক|আগে/i,
  method: /calculat|how does|how is|how do|method|work out|works|algorithm|regression|formula|derive|হিসাব|কীভাবে|পদ্ধতি|অ্যালগরিদম|রিগ্রেশন/i,
};

/** Only raised when the question actually reaches for something the snapshot cannot hold. */
function unanswerable(question: string, snapshot: EvidenceSnapshot): CannotAnswerCode[] {
  if (!question.trim()) return [];
  const codes: CannotAnswerCode[] = [];
  if (TOPIC.change.test(question) && !snapshot.historyAvailable) codes.push("no_history");
  if (/actual|real|measured|প্রকৃত|বাস্তব/i.test(question) && TOPIC.savings.test(question)) codes.push("no_actual_savings");
  if (/guarantee|optimal|shortest|best|নিশ্চিত|সর্বোত্তম|সর্বনিম্ন/i.test(question)) codes.push("no_optimality");
  if (/prevent|stopped|avoid|ঠেকা|রোধ/i.test(question)) codes.push("no_prevention");
  if (/traffic|capacity|road|fit|যানজট|ধারণক্ষমতা|রাস্তা/i.test(question)) codes.push("no_feasibility");
  return codes.slice(0, 2);
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
/**
 * People do not say "about 31.85%". Rounding here stays inside the validator's tolerance,
 * so a rounded figure is still checked against the evidence it came from.
 */
const whole = (value: number) => Math.round(value);
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

interface DashboardContext {
  bins: { total: number; healthy: number; watch: number; high: number; critical: number; avgFill: number; overflowing: number };
  forecasting: { lookaheadHours: number; additionalAtRisk: number; usableForecastCount: number; staleForecastCount: number; missingForecastCount: number };
  complaints: { open: number; urgent: number; highPriority: number; resolved: number; total: number; avgResolutionHours: number };
  fleet: { availableTrucks: number };
  routes: { active: number; total: number; completed: number; distanceKm: number };
  impact: {
    routesScored: number; avgSavedPercent: number; totalOptimizedKm: number; totalBaselineKm: number;
    planned: { modeledCostSavedBdt: number }; completedModeled: { routes: number; modeledCostSavedBdt: number };
  };
}

interface RouteContext {
  provenance: { persisted: boolean; dispatched: boolean; completed: boolean; status: string };
  selection: { selectedBinCount: number; activeBinCount: number | null; excludedBinCount: number | null; thresholdSelected: number | null; forecastSelected: number | null; thresholdPercent?: number; lookaheadHours?: number; reasonsKnown: boolean };
  comparison: { baselineDistanceKm: number; optimizedDistanceKm: number; distanceSavedKm: number; distanceSavedPercent: number; modeledCostSavedBdt: number } | null;
}

/**
 * Writes the briefing SafaiTrack shows when the model is unavailable, disabled or rejected.
 * Every figure is interpolated from a snapshot evidence value, never recomputed here.
 */
export function deterministicBriefing(snapshot: EvidenceSnapshot, language: Language, question = ""): ComposedBriefing {
  const composed = snapshot.focus
    ? focusBriefing(snapshot, language, question)
    : snapshot.feature === "route"
      ? routeBriefing(snapshot.context as unknown as RouteContext, language, question)
      : dashboardBriefing(snapshot.context as unknown as DashboardContext, language, question);
  return {
    ...composed,
    sections: composed.sections.filter(section => snapshot.sectionLabels.includes(section.label)).slice(0, 4),
    noteIds: composed.noteIds.filter(id => snapshot.notes[id]),
    recommendedViews: composed.recommendedViews.filter(view => snapshot.allowedViews.includes(view)),
    cannotAnswer: unanswerable(question, snapshot),
  };
}

/**
 * The answer for one selected dashboard element. Kept to a couple of sentences because it is
 * read inside a bubble, and held to the narrowed evidence that element was allowed to draw on.
 */
/**
 * Level two of progressive disclosure: how a number is worked out, in the words a supervisor
 * would use. The deeper algorithmic account stays behind an explicit request for it.
 */
function methodAnswer(id: string, context: DashboardContext, bn: boolean, deep: boolean): { headline: string; summary: string } | null {
  switch (id) {
    case "bins_need_attention":
      return {
        headline: bn ? `যেসব বিনের ভরাট ${FILL_BANDS.critical}% ছুঁয়েছে, সেগুলোই এখানে গোনা হয়` : `It counts bins whose fill has reached ${FILL_BANDS.critical}%`,
        summary: bn
          ? `প্রতিটি বিনের সর্বশেষ ভরাটের রিডিং দেখা হয়; ${FILL_BANDS.critical}% বা তার বেশি হলে বিনটি এই সংখ্যায় ঢোকে। এটি এখনকার অবস্থা, কোনো পূর্বাভাস নয়।`
          : `SafaiTrack takes each bin's latest fill reading, and any bin at ${FILL_BANDS.critical}% or above lands in this number. It reflects where things stand now rather than any projection.`,
      };
    case "bins_monitored":
      return {
        headline: bn ? `এটি সক্রিয় বিনের সংখ্যা` : `It is the count of active bins`,
        summary: bn
          ? `আপনার দেখার অনুমতি আছে এমন ওয়ার্ডগুলোর প্রতিটি সক্রিয় বিন এখানে গোনা হয়। বন্ধ বা সরিয়ে ফেলা বিন এতে থাকে না।`
          : `Every active bin in the wards you can see is counted here. Bins taken out of service are left out.`,
      };
    case "active_routes":
      return {
        headline: bn ? `চালককে দেওয়া বা শুরু হওয়া রুটই গোনা হয়` : `It counts routes that are assigned or started`,
        summary: bn
          ? `একটি রুট এখানে আসে যখন সেটি কোনো চালকের নামে যায় বা কাজ শুরু হয়। খসড়া ও সম্পন্ন রুট এতে থাকে না।`
          : `A route enters this number once it has gone to a driver or work has begun. Drafts and finished routes are not counted.`,
      };
    case "avg_resolution":
      return {
        headline: bn ? `অভিযোগ জমা থেকে নিষ্পত্তি পর্যন্ত সময়ের গড়` : `It averages the time from complaint to resolution`,
        summary: bn
          ? `প্রতিটি নিষ্পত্তি হওয়া অভিযোগের জমা পড়ার সময় থেকে নিষ্পত্তি চিহ্নিত হওয়ার সময় পর্যন্ত হিসাব করে গড় করা হয়। এখনো খোলা অভিযোগ এই গড়ে নেই।`
          : `For each resolved complaint SafaiTrack measures how long it took from being filed to being marked resolved, then averages those. Complaints still open are not part of it.`,
      };
    case "forecast_window":
      return deep
        ? {
            headline: bn ? `প্রতিটি বিনের ভরাটের গতি বের করে সময় হিসাব করা হয়` : `It fits each bin's recent readings to estimate a rate`,
            summary: bn
              ? `SafaiTrack প্রতিটি বিনের সাম্প্রতিক বৈধ রিডিংয়ের উপর একটি সরল রৈখিক রিগ্রেশন বসায়, তা থেকে ভরাটের গতি পায়, আর সেই গতিতে ${context.forecasting.lookaheadHours} ঘণ্টার মধ্যে পূর্ণ হবে কি না দেখে। যে বিনের রিডিং পুরোনো বা অনুপস্থিত, তার কোনো হিসাব করা হয় না।`
              : `SafaiTrack fits a simple linear regression over each bin's recent valid readings, reads the fill rate off that fit, and checks whether the bin would reach full inside ${context.forecasting.lookaheadHours} hours. Bins whose readings are missing or too old are left without an estimate rather than guessed at.`,
          }
        : {
            headline: bn ? `সাম্প্রতিক রিডিং দেখে ভরাটের গতি আন্দাজ করা হয়` : `It looks at how fast each bin has been filling`,
            summary: bn
              ? `প্রতিটি বিনের সাম্প্রতিক ভরাটের রিডিং থেকে দেখা হয় সেটি কত দ্রুত ভরছে, আর সেই গতিতে ${context.forecasting.lookaheadHours} ঘণ্টার মধ্যে পূর্ণ হতে পারে কি না। এটি অনুমান, তাই পরিস্থিতি বদলাতে পারে।`
              : `SafaiTrack looks at each bin's recent fill readings to see how quickly it has been filling, then checks whether that pace would take it to full within ${context.forecasting.lookaheadHours} hours. It is an estimate, so conditions can still change.`,
          };
    case "route_savings":
      return {
        headline: bn ? `সাজানো রুট আর কোড-ক্রমে ঘোরার তুলনা` : `It compares the planned route with a fixed-order run`,
        summary: bn
          ? `একই বিনগুলোর জন্য SafaiTrack সাজানো ক্রমের পথ আর কোড ধরে সব বিনে ঘোরার পথ — এই পথগুলোর দৈর্ঘ্য বের করে পার্থক্যটা দেখায়। দূরত্ব আসে বিনের অবস্থানের সরলরেখার হিসাবে সড়ক সমন্বয় করে।`
          : `For the same bins, SafaiTrack works out the distance in the planned order and the distance of a run that visits every bin in code order, then shows the gap between them. Those distances come from the bins' coordinates with a road adjustment applied.`,
      };
    case "complaints_open":
      return {
        headline: bn ? `যেসব অভিযোগ এখনো নিষ্পত্তি হয়নি` : `It counts complaints not yet resolved`,
        summary: bn
          ? `জমা পড়া, বরাদ্দ হওয়া ও কাজ চলছে এমন অভিযোগ এখানে গোনা হয়। নিষ্পত্তি বা বাতিল হওয়া অভিযোগ বাদ যায়।`
          : `Complaints that are filed, assigned or in progress are counted here. Resolved and rejected ones drop out.`,
      };
    case "bin":
      return {
        headline: bn ? `এই বিনের সাম্প্রতিক রিডিং থেকে হিসাব` : `It comes from this bin's recent readings`,
        summary: bn
          ? `বিনটির সর্বশেষ ভরাটের রিডিং এবং তার আগের কয়েকটি রিডিং দেখে ভরাটের গতি বের করা হয়। সেই গতি থেকেই সম্ভাব্য সময় আসে, তাই এটি নিশ্চিত কিছু নয়।`
          : `SafaiTrack reads this bin's latest fill level and the readings just before it to work out how fast it is filling. Any timing you see follows from that pace, so it is an estimate rather than a certainty.`,
      };
    default:
      return null;
  }
}

function focusBriefing(snapshot: EvidenceSnapshot, language: Language, question: string): ComposedBriefing {
  const bn = language === "bn";
  const context = snapshot.context as unknown as DashboardContext & { bin?: { binCode: string; currentFillPercent: number; hoursToOverflow: number | null; readingsUsable: boolean } };
  const sections: { label: SectionLabel; text: string; evidenceIds: string[] }[] = [];
  const ids = Object.keys(snapshot.evidence);
  let headline = "";
  let summary = "";

  // "How is this calculated?" is a different question from "what is this?", and gets its own answer.
  if (TOPIC.method.test(question)) {
    const deep = /algorithm|regression|model|formula|অ্যালগরিদম|রিগ্রেশন|সূত্র/i.test(question);
    const method = methodAnswer(snapshot.focus!.id, context, bn, deep);
    if (method) return { ...method, sections: [], noteIds: [], recommendedViews: [], cannotAnswer: [] };
  }

  switch (snapshot.focus!.id) {
    case "bin": {
      const bin = context.bin!;
      if (bin.currentFillPercent >= 100) {
        headline = bn ? `${bin.binCode} ইতিমধ্যে পূর্ণ হিসেবে রেকর্ড হয়েছে` : `${bin.binCode} is already recorded as full`;
        summary = bn
          ? `এর সর্বশেষ রিডিং ${bin.currentFillPercent}%, তাই এটি আলাদা করে দেখানো হচ্ছে। এটি এখনকার রিডিং, ভবিষ্যতের অনুমান নয়।`
          : `Its latest reading is ${bin.currentFillPercent}%, which is why it stands out. That is a present reading, not a projection.`;
      } else if (bin.hoursToOverflow !== null) {
        headline = bn ? `${bin.binCode} প্রায় ${oneDecimal(bin.hoursToOverflow)} ঘণ্টায় ভরে যেতে পারে` : `${bin.binCode} may fill up in about ${oneDecimal(bin.hoursToOverflow)} hours`;
        summary = bn
          ? `এখন এটি ${bin.currentFillPercent}% ভরা। সময়টা এসেছে এর সাম্প্রতিক রিডিং থেকে, তাই কাজে নামার আগে সর্বশেষ মাত্রা দেখে নেওয়া ভালো।`
          : `It is at ${bin.currentFillPercent}% now. That timing comes from its recent fill readings, so it is worth checking the latest level before acting on it.`;
      } else {
        headline = bn ? `${bin.binCode} এখন ${bin.currentFillPercent}% ভরা` : `${bin.binCode} is at ${bin.currentFillPercent}% full`;
        summary = bn
          ? `কখন ভরে যেতে পারে তা বলার মতো যথেষ্ট সাম্প্রতিক রিডিং এই বিনের নেই।`
          : `There are not enough recent readings for this bin to estimate when it might fill up.`;
      }
      break;
    }
    case "bins_monitored": {
      const bins = context.bins;
      headline = bn ? `${bins.total}টি বিন পর্যবেক্ষণে আছে` : `${bins.total} bins are being monitored`;
      summary = bn
        ? `এটি এই ভিউয়ের প্রতিটি সক্রিয় বিন। এখন ${bins.healthy}টি স্বাভাবিক মাত্রায় এবং ${bins.critical}টি সংকটাপন্ন, গড় ভরাট ${whole(bins.avgFill)}%।`
        : `That is every active bin in this view. Right now ${bins.healthy} are in a healthy range and ${bins.critical} are critical, with average fill at ${whole(bins.avgFill)}%.`;
      break;
    }
    case "bins_need_attention": {
      const bins = context.bins;
      const allFull = bins.total > 0 && bins.overflowing === bins.total;
      headline = allFull
        ? bn ? `পর্যবেক্ষণে থাকা ${bins.total}টি বিনই ইতিমধ্যে পূর্ণ` : `All ${bins.total} monitored bins are already full`
        : bn ? `${bins.total}টির মধ্যে ${bins.critical}টি বিন সংকটাপন্ন মাত্রায়` : `${bins.critical} of ${bins.total} bins are in the critical range`;
      summary = allFull
        ? bn
          ? `কারণ প্রতিটি পর্যবেক্ষিত বিনই এখন পূর্ণ হিসেবে রেকর্ড হয়েছে। তাই এটি আগাম সতর্কতা নয়, জমে থাকা সংগ্রহের কাজ — ${context.fleet.availableTrucks}টি ট্রাক উপলব্ধ হিসেবে চিহ্নিত আছে।`
          : `Because every monitored bin is currently recorded as full. That makes this a collection backlog rather than an early warning, and ${context.fleet.availableTrucks} ${plural(context.fleet.availableTrucks, "truck is", "trucks are")} marked available to work through it.`
        : bn
          ? `একটি বিন এখানে আসে যখন তার ভরাট ${FILL_BANDS.critical}% ছুঁয়ে ফেলে।${bins.overflowing > 0 ? ` এর মধ্যে ${bins.overflowing}টি ইতিমধ্যে পূর্ণ হিসেবে রেকর্ড হয়েছে।` : ""}`
          : `A bin lands here once its fill reaches ${FILL_BANDS.critical}%.${bins.overflowing > 0 ? ` ${bins.overflowing} of them are already recorded as full.` : ""}`;
      break;
    }
    case "active_routes": {
      const routes = context.routes;
      headline = routes.active === 0
        ? bn ? `এখন কোনো রুট চলছে না` : `No routes are running right now`
        : bn ? `${routes.active}টি রুট বরাদ্দ বা চলমান` : `${routes.active} ${plural(routes.active, "route is", "routes are")} assigned or under way`;
      summary = routes.total === 0
        ? bn ? `এই ভিউতে এখনো কোনো রুট তৈরি হয়নি, তাই গোনার মতো কিছু নেই।` : `No routes have been generated in this view yet, so there is nothing to count.`
        : bn
          ? `একটি রুট এখানে গোনা হয় যখন সেটি কোনো চালককে দেওয়া হয় বা শুরু হয়। এই ভিউতে মোট ${routes.total}টি রুট আছে, এর ${routes.completed}টি সম্পন্ন হিসেবে চিহ্নিত।`
          : `A route counts here once it has been assigned to a driver or started. This view holds ${routes.total} ${plural(routes.total, "route", "routes")} in total, ${routes.completed} of them marked complete.`;
      break;
    }
    case "avg_resolution": {
      const complaints = context.complaints;
      headline = complaints.resolved === 0
        ? bn ? `এখনো কোনো অভিযোগ নিষ্পত্তি হয়নি` : `No complaints have been resolved yet`
        : bn ? `নিষ্পত্তি হতে গড়ে প্রায় ${whole(complaints.avgResolutionHours)} ঘণ্টা লেগেছে` : `Resolved complaints took about ${whole(complaints.avgResolutionHours)} hours on average`;
      summary = complaints.resolved === 0
        ? bn
          ? `এই গড়ে কেবল নিষ্পত্তি হয়ে যাওয়া অভিযোগ গোনা হয়, আর এই ভিউতে এখনো সেরকম কিছু নেই। ${complaints.open}টি অভিযোগ এখনো খোলা।`
          : `This average only counts complaints already marked resolved, and this view has none yet. ${complaints.open} ${plural(complaints.open, "is", "are")} still open.`
        : bn
          ? `এটি মাপা হয় অভিযোগ জমা পড়া থেকে নিষ্পত্তি চিহ্নিত হওয়া পর্যন্ত, ${complaints.resolved}টি নিষ্পত্তি হওয়া অভিযোগের উপর। ${complaints.open}টি এখনো খোলা।`
          : `It is measured from when a complaint was created to when it was marked resolved, across ${complaints.resolved} resolved ${plural(complaints.resolved, "report", "reports")}. ${complaints.open} ${plural(complaints.open, "is", "are")} still open.`;
      if (/good|bad|target|sla|benchmark|ভালো|খারাপ|লক্ষ্য/i.test(question)) {
        sections.push({
          label: "context",
          evidenceIds: ["complaints.avgResolutionHours"],
          text: bn
            ? `তুলনা করার মতো কোনো লক্ষ্যমাত্রা বা সেবার প্রতিশ্রুতি SafaiTrack-এ রাখা নেই, তাই এটি ভালো না খারাপ তা বলা যাচ্ছে না — সংখ্যাটি কেবল বলছে নিষ্পত্তিতে গড়ে কত সময় লেগেছে।`
            : `SafaiTrack has no target or service commitment stored to compare this against, so I cannot say whether it is good or bad. The number only tells you how long resolved complaints took on average.`,
        });
      }
      break;
    }
    case "forecast_window": {
      const outlook = context.forecasting;
      const bins = context.bins;
      if (outlook.additionalAtRisk === 0 && bins.overflowing > 0) {
        headline = bn ? `নতুন করে কিছু আসছে না — এগুলো ইতিমধ্যে পূর্ণ` : `Nothing new is projected — these bins are already full`;
        summary = bn
          ? `আউটলুকে কেবল সেই বিনগুলো গোনা হয় যেগুলো এখনো ভরেনি। ${bins.total}টির মধ্যে ${bins.overflowing}টি ইতিমধ্যে পূর্ণ হিসেবে রেকর্ড হয়েছে, অর্থাৎ সেটি এখনকার অবস্থা — আগামী ${outlook.lookaheadHours} ঘণ্টায় যা হতে পারে তা নয়।`
          : `The outlook only counts bins that are not full yet. ${bins.overflowing} of ${bins.total} are already recorded as full, which is a present reading rather than something that may happen in the next ${outlook.lookaheadHours} hours.`;
      } else if (outlook.additionalAtRisk > 0) {
        headline = bn ? `${outlook.lookaheadHours} ঘণ্টার মধ্যে ${outlook.additionalAtRisk}টি বিন ভরে যেতে পারে` : `${outlook.additionalAtRisk} ${plural(outlook.additionalAtRisk, "bin", "bins")} may fill up within ${outlook.lookaheadHours} hours`;
        summary = bn
          ? `এগুলো এখনো ভরেনি। হিসাবটা আসে প্রতিটি বিনের সাম্প্রতিক ভরাটের রিডিং থেকে, তাই পরিস্থিতি বদলাতেও পারে — কাজে নামার আগে সর্বশেষ মাত্রা দেখে নেওয়া ভালো।`
          : `They are not full yet. The estimate comes from each bin's recent fill readings, so conditions can still change — it is worth checking their latest levels before acting.`;
      } else {
        headline = bn ? `আগামী ${outlook.lookaheadHours} ঘণ্টায় কিছু দেখা যাচ্ছে না` : `Nothing is projected for the next ${outlook.lookaheadHours} hours`;
        summary = bn
          ? `এই মুহূর্তে কোনো বিনের ভরে যাওয়ার ব্যবহারযোগ্য পূর্বাভাস এই সময়ের মধ্যে পড়ছে না।`
          : `No bin currently has a usable projection that falls inside that window.`;
      }
      if (outlook.staleForecastCount + outlook.missingForecastCount > 0) {
        const gaps: string[] = [];
        if (outlook.staleForecastCount > 0) gaps.push(bn ? `${outlook.staleForecastCount}টির রিডিং পুরোনো` : `${outlook.staleForecastCount} have readings too old to project from`);
        if (outlook.missingForecastCount > 0) gaps.push(bn ? `${outlook.missingForecastCount}টির কোনো রিডিং নেই` : `${outlook.missingForecastCount} have no readings at all`);
        sections.push({
          label: "outlook",
          evidenceIds: ids.filter(id => id.startsWith("forecasting.")),
          text: bn ? `${gaps.join(" এবং ")}, তাই আউটলুক এই ভিউয়ের একাংশ ঢাকে।` : `${gaps.join(" and ")}, so the outlook covers only part of this view.`,
        });
      }
      break;
    }
    case "route_savings": {
      const impact = context.impact;
      if (impact.routesScored === 0) {
        headline = bn ? `এখনো কোনো রুটের তুলনা হয়নি` : `No route comparison has been scored yet`;
        summary = bn
          ? `SafaiTrack পরিকল্পিত দূরত্বের সাশ্রয় দেখায় কেবল তখনই, যখন একটি রুট তৈরি হয়ে কোড-ক্রমে ঘোরার বিকল্পের সঙ্গে তুলনা হয়। এই ভিউতে সেরকম কিছু এখনো নেই — অর্থাৎ সাশ্রয় হয়নি এমন নয়, বলার মতো তুলনাই নেই।`
          : `SafaiTrack shows a planned distance saving only once it has generated a route and compared it with the fixed-order alternative. None have been scored in this view yet, so there is nothing to report — not a saving that came out empty.`;
      } else {
        headline = bn ? `পরিকল্পিত পথ প্রায় ${whole(impact.avgSavedPercent)}% কম` : `About ${whole(impact.avgSavedPercent)}% less planned travel`;
        summary = bn
          ? `${impact.routesScored}টি রুটের তুলনায় পরিকল্পিত পথ ${oneDecimal(impact.totalOptimizedKm)} কিমি, আর প্রতিটি বিনে কোড ধরে ঘোরার পথ ${oneDecimal(impact.totalBaselineKm)} কিমি। এটি সেই তুলনার হিসাব — সংগ্রহের পরে মাপা কিছু নয়।`
          : `Across ${impact.routesScored} scored ${plural(impact.routesScored, "route", "routes")} the planned distance is ${oneDecimal(impact.totalOptimizedKm)} km, against ${oneDecimal(impact.totalBaselineKm)} km for a run that visits every bin in code order. That comparison is where the figure comes from, rather than anything metered after a collection.`;
      }
      break;
    }
    case "complaints_open": {
      const complaints = context.complaints;
      headline = complaints.open === 0
        ? bn ? `এখন কোনো অভিযোগ খোলা নেই` : `No complaints are open right now`
        : bn ? `${complaints.open}টি অভিযোগ এখনো খোলা` : `${complaints.open} ${plural(complaints.open, "complaint is", "complaints are")} still open`;
      const marks: string[] = [];
      if (complaints.urgent > 0) marks.push(bn ? `${complaints.urgent}টি জরুরি` : `${complaints.urgent} ${plural(complaints.urgent, "is", "are")} marked urgent`);
      if (complaints.highPriority > 0) marks.push(bn ? `${complaints.highPriority}টি উচ্চ অগ্রাধিকারের` : `${complaints.highPriority} high priority`);
      summary = complaints.open === 0
        ? bn ? `এই ভিউতে অপেক্ষায় কিছু নেই।` : `Nothing is waiting in this view.`
        : bn
          ? `${marks.length ? `এর মধ্যে ${marks.join(" ও ")}। ` : ""}এগুলো বাসিন্দাদের প্রতিবেদন, সেন্সরের রিডিং নয়, তাই কোনোটি বেশি ভরা বিনের একই এলাকার কি না দেখে নেওয়া ভালো।`
          : `${marks.length ? `Of those, ${marks.join(" and ")}. ` : ""}These are resident reports rather than sensor readings, so it is worth checking whether any describe the same places as the high-fill bins.`;
      break;
    }
    default: {
      const bins = context.bins;
      headline = bins.critical > 0
        ? bn ? `চাপ এখন সংকটাপন্ন বিনগুলোতে` : `The pressure is on the critical bins`
        : bn ? `এখন বড় কোনো চাপ নেই` : `Nothing is under real pressure right now`;
      const everywhere = bins.total > 0 && bins.critical === bins.total;
      summary = bn
        ? `${everywhere ? `এই ভিউয়ের প্রতিটি বিনই সংকটাপন্ন মাত্রায়, তাই চাপ কোনো এক জায়গায় নয়` : `${bins.total}টির মধ্যে ${bins.critical}টি বিন সংকটাপন্ন মাত্রায়`} এবং ${context.complaints.open}টি অভিযোগ খোলা। ${context.fleet.availableTrucks}টি ট্রাক উপলব্ধ হিসেবে চিহ্নিত আছে।`
        : `${everywhere ? `Every bin in this view is in the critical range, so the pressure is not concentrated anywhere in particular` : `${bins.critical} of ${bins.total} bins are in the critical range`}, and ${context.complaints.open} ${plural(context.complaints.open, "complaint is", "complaints are")} open. ${context.fleet.availableTrucks} ${plural(context.fleet.availableTrucks, "truck is", "trucks are")} marked available.`;
    }
  }

  const noteIds: string[] = [];
  if (TOPIC.change.test(question)) noteIds.push("no_history");
  return {
    headline, summary, sections,
    noteIds,
    recommendedViews: [],
    cannotAnswer: [],
  };
}

function dashboardBriefing(context: DashboardContext, language: Language, question: string): ComposedBriefing {
  const { bins, forecasting: outlook, complaints, fleet, routes, impact } = context;
  const bn = language === "bn";
  const sections: { label: SectionLabel; text: string; evidenceIds: string[] }[] = [];
  const pressure = bins.critical > 0;
  // Everything already full is a backlog, not a warning, and repeating one count three times reads badly.
  const allFull = bins.total > 0 && bins.overflowing === bins.total;

  const headline = allFull
    ? bn
      ? `এখানকার ${bins.total}টি বিনই ইতিমধ্যে পূর্ণ`
      : `All ${bins.total} bins here are already full`
    : pressure
    ? bn
      ? `${bins.critical}টি বিনে এখনই নজর দেওয়া দরকার`
      : `${bins.critical} ${plural(bins.critical, "bin needs", "bins need")} attention right now`
    : outlook.additionalAtRisk > 0
      ? bn
        ? `জরুরি কিছু নেই, তবে ${outlook.additionalAtRisk}টি বিন শিগগিরই ভরে যেতে পারে`
        : `Nothing urgent, but ${outlook.additionalAtRisk} ${plural(outlook.additionalAtRisk, "bin", "bins")} may fill up soon`
      : bn
        ? "এখন পরিস্থিতি স্থিতিশীল দেখাচ্ছে"
        : "Things look stable right now";

  let summary: string;
  if (allFull) {
    summary = bn
      ? `এই ভিউয়ের প্রতিটি বিনই পূর্ণ অবস্থায় রেকর্ড হয়েছে, অর্থাৎ এটি আগাম সতর্কতা নয় — জমে থাকা সংগ্রহের কাজ।`
      : `Every bin in this view is recorded at full, which makes this a collection backlog rather than an early warning.`;
  } else if (pressure) {
    summary = bn
      ? `${bins.total}টির মধ্যে ${bins.critical}টি বিন সংকটাপন্ন মাত্রায় আছে${outlook.additionalAtRisk > 0 ? `, আর আরও ${outlook.additionalAtRisk}টি ${outlook.lookaheadHours} ঘণ্টার মধ্যে ভরে যেতে পারে` : ""}।`
      : `${bins.critical} of ${bins.total} bins are in the critical fill range${outlook.additionalAtRisk > 0 ? `, and ${outlook.additionalAtRisk} more could reach overflow within ${outlook.lookaheadHours} hours` : ""}.`;
    if (bins.overflowing > 0) {
      summary += bn ? ` ${bins.overflowing}টি ইতিমধ্যে পূর্ণ হিসেবে রেকর্ড হয়েছে।` : ` ${bins.overflowing} of them are already recorded as full.`;
    }
  } else if (outlook.additionalAtRisk > 0) {
    summary = bn
      ? `${bins.total}টির মধ্যে ${bins.healthy}টি বিন স্বাভাবিক মাত্রায় আছে এবং কোনোটি সংকটাপন্ন নয়। তবে ${outlook.additionalAtRisk}টি বিন ${outlook.lookaheadHours} ঘণ্টার মধ্যে ভরে যেতে পারে।`
      : `${bins.healthy} of ${bins.total} bins are in a healthy range and none are critical. That said, ${outlook.additionalAtRisk} could reach overflow within ${outlook.lookaheadHours} hours.`;
  } else {
    summary = bn
      ? `${bins.total}টির মধ্যে ${bins.healthy}টি বিন স্বাভাবিক মাত্রায় আছে এবং গড় ভরাট ${bins.avgFill}%। এই মুহূর্তে সংগ্রহের চাপ কম।`
      : `${bins.healthy} of ${bins.total} bins are in a healthy range and average fill is ${bins.avgFill}%. Collection pressure is low at the moment.`;
  }

  if (pressure) {
    sections.push({
      label: "attention",
      evidenceIds: ["bins.critical", "bins.avgFill", "fleet.availableTrucks"],
      text: allFull
        ? bn
          ? `সবগুলো বিনই একসঙ্গে সংগ্রহের অপেক্ষায়, তাই এখানে অগ্রাধিকার ঠিক করাই মূল কাজ। ${fleet.availableTrucks}টি ট্রাক উপলব্ধ হিসেবে চিহ্নিত আছে।`
          : `With every bin waiting at once, the work here is deciding an order rather than spotting a risk. ${fleet.availableTrucks} ${plural(fleet.availableTrucks, "truck is", "trucks are")} marked available.`
        : bn
          ? `সংকটাপন্ন বিনগুলোই এখন প্রধান বিষয়; এই ভিউয়ে গড় ভরাট ${whole(bins.avgFill)}%। ${fleet.availableTrucks}টি ট্রাক উপলব্ধ হিসেবে চিহ্নিত আছে।`
          : `The critical bins are the main pressure here; average fill across this view is ${whole(bins.avgFill)}%. ${fleet.availableTrucks} ${plural(fleet.availableTrucks, "truck is", "trucks are")} marked available.`,
    });
  }

  if (outlook.additionalAtRisk > 0 || outlook.staleForecastCount > 0 || outlook.missingForecastCount > 0) {
    const gaps: string[] = [];
    if (outlook.staleForecastCount > 0) gaps.push(bn ? `${outlook.staleForecastCount}টির রিডিং পুরোনো` : `${outlook.staleForecastCount} have readings too old to project from`);
    if (outlook.missingForecastCount > 0) gaps.push(bn ? `${outlook.missingForecastCount}টির কোনো রিডিং নেই` : `${outlook.missingForecastCount} have no readings at all`);
    sections.push({
      label: "outlook",
      evidenceIds: ["forecasting.additionalAtRisk", "forecasting.lookaheadHours", "forecasting.usableForecastCount"],
      text: (outlook.additionalAtRisk > 0
        ? bn
          ? `আউটলুকে থাকা ${outlook.additionalAtRisk}টি বিন এখনো ভরেনি — এটি সাম্প্রতিক রিডিং থেকে করা অনুমান, তাই কাজ শুরুর আগে সর্বশেষ মাত্রা দেখে নেওয়া ভালো।`
          : `The ${outlook.additionalAtRisk} bins in the outlook are not full yet. That is an estimate from their recent fill readings, so it is worth checking their latest levels before acting on it.`
        : bn
          ? `এই মুহূর্তে ${outlook.lookaheadHours} ঘণ্টার মধ্যে ভরে যাওয়ার মতো ব্যবহারযোগ্য পূর্বাভাস কোনো বিনের নেই।`
          : `No bin currently has a usable projection into the next ${outlook.lookaheadHours} hours.`)
        + (gaps.length ? (bn ? ` ${gaps.join(" এবং ")}, তাই আউটলুক পুরো ওয়ার্ড ঢাকে না।` : ` ${gaps.join(" and ")}, so the outlook covers only part of this view.`) : ""),
    });
  }

  if (complaints.open > 0) {
    sections.push({
      label: "context",
      evidenceIds: ["complaints.open", "complaints.urgent"],
      text: bn
        ? `${complaints.open}টি অভিযোগ এখনো খোলা${complaints.urgent > 0 ? `, এর ${complaints.urgent}টি জরুরি হিসেবে চিহ্নিত` : ""}। এগুলো বাসিন্দাদের প্রতিবেদন, সেন্সরের রিডিং নয়, তাই কোনোটি বেশি ভরা বিনের একই এলাকার কি না দেখে নেওয়া ভালো।`
        : `${complaints.open} ${plural(complaints.open, "complaint is", "complaints are")} still open${complaints.urgent > 0 ? `, ${complaints.urgent} of them marked urgent` : ""}. These are resident reports rather than sensor readings, so it is worth checking whether any describe the same locations as the high-fill bins.`,
    });
  }

  if (TOPIC.savings.test(question) && impact.routesScored > 0) {
    sections.push({
      label: "savings",
      evidenceIds: ["impact.plannedCost", "impact.routesScored", "impact.completedCost"],
      text: bn
        ? `${impact.routesScored}টি রুটের তুলনা থেকে পরিকল্পিত খরচ সাশ্রয় ৳${impact.planned.modeledCostSavedBdt}, আর সম্পন্ন রুটের হিসাবে ৳${impact.completedModeled.modeledCostSavedBdt}। দুটিই রুট তুলনার হিসাব — সংগ্রহের পরে জ্বালানি মেপে পাওয়া অঙ্ক নয়।`
        : `Across ${impact.routesScored} scored ${plural(impact.routesScored, "route", "routes")}, planning shows ৳${impact.planned.modeledCostSavedBdt} in cost saving, and ৳${impact.completedModeled.modeledCostSavedBdt} on routes already marked complete. Both come from the route comparison rather than fuel metered after a collection.`,
    });
  }

  sections.push({
    label: "next_step",
    evidenceIds: pressure ? ["bins.critical", "complaints.open"] : ["forecasting.additionalAtRisk", "routes.active"],
    text: allFull
      ? bn
        ? `যেহেতু সবগুলোই অপেক্ষায়, এখানে মূল সিদ্ধান্ত ক্রম ঠিক করা। খোলা অভিযোগগুলো দেখে নিলে কোনগুলো আগে ধরবেন তা বেছে নেওয়া সহজ হয়।`
        : `Since everything is waiting, the decision here is sequence rather than priority. Looking through the open complaints is a reasonable way to choose what to take first.`
      : pressure
      ? bn
        ? `সংকটাপন্ন বিনগুলো দিয়ে শুরু করুন, তারপর পরবর্তী সংগ্রহের রুট সাজানোর আগে খোলা অভিযোগগুলো দেখে নিন।`
        : `Start with the bins in the critical range, then look through the open complaints before putting together the next collection route.`
      : outlook.additionalAtRisk > 0
        ? bn
          ? `এখনই কিছু করার দরকার নেই; আজকের মধ্যে আউটলুকে থাকা বিনগুলো একবার দেখে নিলেই যথেষ্ট।`
          : `Nothing needs immediate action; checking the bins in the outlook later today should be enough.`
        : bn
          ? `এই ভিউ থেকে জরুরি কিছু করার দরকার দেখা যাচ্ছে না। ${routes.active}টি রুট এখন চলমান বা বরাদ্দকৃত।`
          : `No immediate action looks necessary from this view. ${routes.active} ${plural(routes.active, "route is", "routes are")} assigned or in progress.`,
  });

  const noteIds: string[] = [];
  // Only caveat an outlook that exists; a note about projections reads oddly when nothing is projected.
  if (outlook.additionalAtRisk > 0) noteIds.push("forecast_estimate");
  if (impact.routesScored > 0) noteIds.unshift("estimates");
  if (TOPIC.change.test(question)) noteIds.unshift("no_history");
  if (complaints.open > 0 && TOPIC.complaints.test(question)) noteIds.unshift("reports_not_verified");

  return {
    headline, summary, sections, noteIds: noteIds.slice(0, 2),
    recommendedViews: pressure ? ["critical_bins", "complaints"] : ["forecasts", "critical_bins"],
    cannotAnswer: [],
  };
}

function routeBriefing(context: RouteContext, language: Language, question: string): ComposedBriefing {
  const { provenance, selection, comparison } = context;
  const bn = language === "bn";
  const sections: { label: SectionLabel; text: string; evidenceIds: string[] }[] = [];
  const stops = selection.selectedBinCount;

  const headline = comparison && comparison.distanceSavedPercent > 0
    ? bn
      ? `${stops}টি স্টপ, পরিকল্পিত পথ প্রায় ${whole(comparison.distanceSavedPercent)}% কম`
      : `${stops} stops, about ${whole(comparison.distanceSavedPercent)}% less planned travel`
    : bn
      ? `এই পরিকল্পনায় ${stops}টি স্টপ`
      : `${stops} ${plural(stops, "stop", "stops")} on this plan`;

  let summary: string;
  if (selection.reasonsKnown && selection.thresholdPercent !== undefined) {
    summary = bn
      ? `এই পরিকল্পনার ${stops}টি বিনেরই এখন সংগ্রহ দরকার: প্রতিটি হয় ${selection.thresholdPercent}% বা তার বেশি ভরা, নয়তো সাম্প্রতিক রিডিং অনুযায়ী ${selection.lookaheadHours} ঘণ্টার মধ্যে ভরে যেতে পারে। এরপর স্টপের ক্রম সাজানো হয়েছে যেন এক বিন থেকে আরেক বিনে কম ঘুরতে হয়।`
      : `All ${stops} bins on this plan currently need collection: each one is either ${selection.thresholdPercent}% full or more, or its recent readings put it within ${selection.lookaheadHours} hours of overflowing. The visit order was then arranged to cut down travel between them.`;
  } else {
    summary = bn
      ? `এই সংরক্ষিত পরিকল্পনায় ${stops}টি স্টপ আছে। তৈরির সময় কোন সীমা ও পূর্বাভাস ব্যবহার করা হয়েছিল তা সংরক্ষণ করা হয়নি, তাই প্রতিটি বিন কেন যুক্ত হয়েছিল তার নির্দিষ্ট কারণ রেকর্ডে নেই।`
      : `This saved plan has ${stops} stops. The settings used when it was created were not stored, so the specific reason each bin was included is not in the record.`;
  }

  if (selection.reasonsKnown && selection.thresholdSelected !== null && selection.forecastSelected !== null) {
    // A clause about zero bins ("and 0 came in through the outlook") is noise, so each half is optional.
    const reasons: string[] = [];
    if (selection.thresholdSelected > 0) {
      reasons.push(bn
        ? `${selection.thresholdSelected}টি বিন আগে থেকেই ভরাটের সীমা ছুঁয়েছিল`
        : `${selection.thresholdSelected} ${plural(selection.thresholdSelected, "bin was", "bins were")} already at or above the fill threshold`);
    }
    if (selection.forecastSelected > 0) {
      reasons.push(bn
        ? `${selection.forecastSelected}টি যুক্ত হয়েছে ভরে যাওয়ার আউটলুক থেকে`
        : `${selection.forecastSelected} came in through the overflow outlook`);
    }
    const rest = (selection.excludedBinCount ?? 0) > 0
      ? bn ? ` ওয়ার্ডের বাকি সক্রিয় বিনগুলো এখনো সেই মাত্রায় পৌঁছায়নি।` : ` The other active bins in this ward have not reached either mark yet.`
      : bn ? ` ওয়ার্ডের সব সক্রিয় বিনই এই পরিকল্পনায় আছে।` : ` Every active bin in this ward is on the plan.`;
    if (reasons.length) {
      sections.push({
        label: "selection",
        evidenceIds: ["selection.thresholdSelected", "selection.forecastSelected", "selection.activeBinCount"],
        text: `${reasons.join(bn ? " এবং " : " and ")}${bn ? "।" : "."}${rest}`,
      });
    }
  }

  if (comparison) {
    sections.push({
      label: "savings",
      evidenceIds: ["comparison.optimizedDistanceKm", "comparison.baselineDistanceKm", "comparison.distanceSavedKm", "comparison.modeledCostSavedBdt"],
      text: bn
        ? `পরিকল্পিত পথ ${oneDecimal(comparison.optimizedDistanceKm)} কিমি, আর প্রতিটি বিনে কোড ধরে ঘোরার তুলনামূলক পথ ${oneDecimal(comparison.baselineDistanceKm)} কিমি — পার্থক্য প্রায় ${oneDecimal(comparison.distanceSavedKm)} কিমি। জ্বালানি ও ৳${whole(comparison.modeledCostSavedBdt)} খরচের হিসাব এই পার্থক্য থেকেই আসে, তাই এগুলো পরিকল্পনার অনুমান।`
        : `The planned distance is ${oneDecimal(comparison.optimizedDistanceKm)} km, against ${oneDecimal(comparison.baselineDistanceKm)} km for a comparison run that visits every bin in code order — a difference of about ${oneDecimal(comparison.distanceSavedKm)} km. The fuel and ৳${whole(comparison.modeledCostSavedBdt)} cost figures come from that difference, which makes them planning estimates.`,
    });
  }

  sections.push({
    label: "next_step",
    evidenceIds: comparison ? ["comparison.optimizedDistanceKm"] : ["selection.selectedBinCount"],
    text: provenance.completed
      ? bn
        ? `ডেটাবেসে রুটটি সম্পন্ন হিসেবে চিহ্নিত। তবু এখানকার সাশ্রয়ের অঙ্ক তুলনার হিসাব থেকেই আসে, সংগ্রহের সময় মাপা কিছু থেকে নয়।`
        : `The database marks this route complete. Even so, the saving figures still come from the comparison rather than from anything metered during the collection.`
      : bn
        ? `স্টপের ক্রমকে শুরুর বিন্দু হিসেবে ধরুন: পরিকল্পনাটি সরলরেখার দূরত্বে সড়ক সমন্বয় করে তৈরি, তাই মাঠে ক্রু-কে কিছুটা মানিয়ে নিতে হতে পারে।`
        : `Treat the stop order as a starting point: the plan is built from straight-line distances with a road adjustment, so the crew may still need to adapt once they are out there.`,
  });

  const noteIds: string[] = [];
  if (!selection.reasonsKnown) noteIds.push("unknown_history");
  if (comparison) noteIds.push("estimates");
  if (!provenance.dispatched) noteIds.push("not_dispatched");
  if (TOPIC.dispatch.test(question)) noteIds.unshift("field_conditions");
  if (TOPIC.method.test(question)) noteIds.unshift("distance_model");

  return {
    headline, summary, sections, noteIds: noteIds.slice(0, 2),
    recommendedViews: ["critical_bins", "forecasts"],
    cannotAnswer: [],
  };
}
