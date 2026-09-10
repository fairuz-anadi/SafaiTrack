import { z } from "zod";
import type { ComposedBriefing, EvidenceSnapshot, Language } from "../../shared/briefings.js";

const CANNOT_ANSWER = ["not_in_evidence", "no_history", "no_actual_savings", "no_feasibility", "no_prevention", "no_optimality"] as const;
const VIEWS = ["critical_bins", "complaints", "forecasts", "routes"] as const;
const LABELS = ["attention", "outlook", "context", "savings", "selection", "next_step"] as const;

export const modelBriefingSchema = z.object({
  headline: z.string().trim().min(3).max(90),
  summary: z.string().trim().min(15).max(420),
  sections: z.array(z.object({
    label: z.enum(LABELS),
    text: z.string().trim().min(15).max(340),
    evidenceIds: z.array(z.string().max(120)).max(16),
  }).strict()).max(4),
  noteIds: z.array(z.string().max(80)).max(8),
  recommendedViews: z.array(z.enum(VIEWS)).max(3),
  cannotAnswer: z.array(z.enum(CANNOT_ANSWER)).max(6),
}).strict();

/**
 * Assertions this evidence can never support. The server writes every caveat itself, so
 * prose never needs to negate one of these and a plain match is a rejection.
 */
const FORBIDDEN: Record<Language, RegExp[]> = {
  en: [
    /\bguarantee/i, /\boptimal\b/i, /\bshortest\b/i, /\bbest possible\b/i,
    /\bprevent/i, /\bavoided an overflow\b/i,
    /\bactual(ly)?\s+sav/i, /\breal\s+sav/i, /\bconfirmed\s+sav/i, /\bmeasured\s+sav/i, /\bproven\b/i,
    /\btraffic\b/i, /\bcongestion\b/i, /\broad condition/i,
    /\bcapacity (is|are|will be)?\s*(sufficient|enough|adequate|fine)\b/i, /\bfits? in the truck\b/i,
    /\bsafe to (dispatch|send|drive)\b/i, /\bdispatch (the |this |truck|now)/i, /\bsend the truck\b/i,
    /\b(remove|delete|cancel|reassign) (the |this )?(bin|stop|route|truck)/i,
    /\bwill (definitely|certainly|overflow|fill|reach|be)\b/i, /\bcertainly\b/i, /\bdefinitely\b/i,
    /\b(increased|decreased|risen|fallen|dropped|grew) from\b/i, /\b(up|down) from\b/i,
    /\bcompared (to|with) (yesterday|last week|earlier|before)\b/i, /\btrend(ing|s)?\b/i, /\bsince (yesterday|last)\b/i,
  ],
  bn: [
    /নিশ্চিত/, /সর্বোত্তম/, /সর্বনিম্ন/,
    /ঠেকিয়েছে/, /প্রতিরোধ করেছে/, /রোধ করেছে/,
    /প্রকৃত সাশ্রয়/, /বাস্তব সাশ্রয়/, /প্রমাণিত/,
    /যানজট/, /রাস্তার অবস্থা/,
    /ধারণক্ষমতা যথেষ্ট/, /ট্রাকে ধরবে/,
    /পাঠিয়ে দিন/, /পাঠান/, /বাতিল করুন/, /সরিয়ে দিন/,
    /অবশ্যই হবে/, /উপচে পড়বেই/,
    /বেড়েছে/, /কমেছে/, /আগের তুলনায়/, /প্রবণতা/,
  ],
};

/** Spelled-out counts would bypass numeric grounding, so prose has to use digits. */
const SPELLED_OUT: Record<Language, RegExp> = {
  en: /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i,
  bn: /(দুই|দুটি|তিন|তিনটি|চার|চারটি|পাঁচ|পাঁচটি|ছয়|ছয়টি|সাত|সাতটি|আট|আটটি|নয়টি|দশ|দশটি|বিশ|ত্রিশ|চল্লিশ|পঞ্চাশ|একশ|হাজার)/,
};
/**
 * A count of one reads as a word but is still a quantity, so English is checked too.
 * Bangla is not: "একটি" is the ordinary indefinite article as well as the numeral, so it
 * carries no reliable count signal — digits still cover every count the prompt asks for.
 */
const SINGULAR_COUNT: Record<Language, RegExp | null> = {
  en: /\bone\s+(bin|stop|route|complaint|truck|ward|collection)/i,
  bn: null,
};

const IDENTITY_SHAPED = /\b[A-Z][A-Z0-9]*-[A-Z0-9]+\b/g;
const NUMERIC = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const BENGALI_DIGITS = /[০-৯]/g;

/**
 * An integer in the evidence is a count, and a count is exact — 0.5 still pins it, because
 * no other integer falls inside. A fractional value is a measurement, and people round those:
 * 4.17 hours is written "4 hours", 31.85% is written "about 32%".
 */
function tolerance(value: number) {
  if (Number.isInteger(value)) return 0.5;
  return Math.max(Math.abs(value) * 0.05, 0.5);
}

function groundedNumbers(snapshot: EvidenceSnapshot) {
  const values = new Set<number>();
  for (const entry of Object.values(snapshot.evidence)) if (typeof entry.value === "number") values.add(entry.value);
  return [...values];
}

/**
 * Holds one sentence to the snapshot: no invented figure, no invented bin or route, and no
 * claim the deterministic layer already knows this system cannot establish.
 */
export function assertGrounded(text: string, snapshot: EvidenceSnapshot, language: Language, values = groundedNumbers(snapshot)) {
  for (const pattern of FORBIDDEN[language]) {
    if (pattern.test(text)) throw new Error(`Unsupported claim: ${pattern}`);
  }
  if (!snapshot.historyAvailable && /\bchanged from\b/i.test(text)) throw new Error("Unsupported change claim");
  if (SPELLED_OUT[language].test(text)) throw new Error("Counts must be written as digits");

  // Named identities are removed first so their digits are never read as quantities.
  let remaining = text;
  for (const identity of [...snapshot.identities].sort((a, b) => b.length - a.length)) {
    remaining = remaining.split(identity).join(" ");
  }
  remaining = remaining.replace(/\bCO[2₂]\b/gi, " ");
  const invented = remaining.match(IDENTITY_SHAPED);
  if (invented) throw new Error(`Unknown identifier: ${invented[0]}`);

  const singular = SINGULAR_COUNT[language];
  if (singular?.test(remaining) && !values.includes(1)) throw new Error("Unsupported count of one");
  const western = remaining.replace(BENGALI_DIGITS, digit => String(digit.charCodeAt(0) - 0x09e6));
  for (const token of western.match(NUMERIC) ?? []) {
    const written = Number(token.replaceAll(",", ""));
    if (!values.some(value => Math.abs(written - value) <= tolerance(value))) {
      throw new Error(`Ungrounded figure: ${token}`);
    }
  }
}

/** Rejects a whole answer rather than repairing it, so the reader sees the fallback instead of a half-verified one. */
export function validateBriefing(raw: string, snapshot: EvidenceSnapshot, language: Language): ComposedBriefing {
  const parsed = modelBriefingSchema.parse(JSON.parse(raw));
  const values = groundedNumbers(snapshot);
  for (const text of [parsed.headline, parsed.summary, ...parsed.sections.map(section => section.text)]) {
    assertGrounded(text, snapshot, language, values);
  }
  for (const section of parsed.sections) {
    if (!snapshot.sectionLabels.includes(section.label)) throw new Error(`Unavailable section: ${section.label}`);
    for (const id of section.evidenceIds) if (!snapshot.evidence[id]) throw new Error(`Unknown evidence: ${id}`);
  }
  for (const id of parsed.noteIds) if (!snapshot.notes[id]) throw new Error(`Unknown note: ${id}`);
  for (const view of parsed.recommendedViews) if (!snapshot.allowedViews.includes(view)) throw new Error(`Unauthorized destination: ${view}`);
  return parsed;
}

/** Constrains the model to the IDs this snapshot actually contains. */
export function modelJsonSchema(snapshot: EvidenceSnapshot): Record<string, unknown> {
  return {
    type: "object", additionalProperties: false,
    required: ["headline", "summary", "sections", "noteIds", "recommendedViews", "cannotAnswer"],
    properties: {
      headline: { type: "string", maxLength: 90 },
      summary: { type: "string", maxLength: 420 },
      sections: {
        type: "array", maxItems: 4, minItems: 0,
        items: {
          type: "object", additionalProperties: false, required: ["label", "text", "evidenceIds"],
          properties: {
            label: { type: "string", enum: snapshot.sectionLabels },
            text: { type: "string", maxLength: 340 },
            evidenceIds: { type: "array", maxItems: 16, items: { type: "string", enum: Object.keys(snapshot.evidence) } },
          },
        },
      },
      noteIds: { type: "array", maxItems: 8, items: { type: "string", enum: Object.keys(snapshot.notes) } },
      recommendedViews: { type: "array", maxItems: 3, items: { type: "string", enum: snapshot.allowedViews } },
      cannotAnswer: { type: "array", maxItems: 6, items: { type: "string", enum: CANNOT_ANSWER } },
    },
  };
}
