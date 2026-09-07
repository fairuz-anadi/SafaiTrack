/**
 * Bilingual UI (English / বাংলা).
 *
 * A waste-reporting tool for Dhaka that only speaks English excludes most of
 * the people who live next to the bins. The citizen-facing surfaces are fully
 * translated; operational dashboards stay in English because that is what
 * DNCC staff paperwork already uses.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "bn";

const STORAGE_KEY = "safaitrack_lang";

const strings = {
  /* nav + shared */
  "nav.howItWorks": { en: "How it works", bn: "কীভাবে কাজ করে" },
  "nav.impact": { en: "Impact", bn: "প্রভাব" },
  "nav.forCities": { en: "For city teams", bn: "সিটি কর্পোরেশনের জন্য" },
  "nav.report": { en: "Report a bin issue", bn: "সমস্যা জানান" },
  "nav.signIn": { en: "Sign in", bn: "সাইন ইন" },
  "nav.dashboard": { en: "Open dashboard", bn: "ড্যাশবোর্ড" },
  "common.back": { en: "Back to home", bn: "হোমে ফিরুন" },
  "common.submit": { en: "Submit report", bn: "রিপোর্ট পাঠান" },
  "common.cancel": { en: "Cancel", bn: "বাতিল" },
  "common.optional": { en: "Optional", bn: "ঐচ্ছিক" },
  "common.loading": { en: "Loading…", bn: "লোড হচ্ছে…" },

  /* landing */
  "hero.eyebrow": {
    en: "Built for the wards that keep Dhaka moving",
    bn: "ঢাকার ওয়ার্ডগুলোর জন্য তৈরি",
  },
  "hero.title1": { en: "Cleaner streets.", bn: "পরিচ্ছন্ন রাস্তা।" },
  "hero.title2": { en: "Smarter routes.", bn: "স্মার্ট রুট।" },
  "hero.body": {
    en: "SafaiTrack turns bin signals, citizen reports and collection routes into one calm command center for healthier neighbourhoods.",
    bn: "সাফাইট্র্যাক বিনের তথ্য, নাগরিকদের অভিযোগ এবং সংগ্রহের রুট একত্র করে একটি পরিষ্কার নিয়ন্ত্রণ কেন্দ্রে পরিণত করে।",
  },
  "hero.cta": { en: "Explore the dashboard", bn: "ড্যাশবোর্ড দেখুন" },

  /* citizen report */
  "report.kicker": { en: "Citizen portal", bn: "নাগরিক পোর্টাল" },
  "report.title1": { en: "Help keep your", bn: "আপনার এলাকা" },
  "report.title2": { en: "neighbourhood clean.", bn: "পরিষ্কার রাখতে সাহায্য করুন।" },
  "report.body": {
    en: "See an overflowing bin, a missed collection, or a damaged container? Tell your ward team. Every report creates a visible path to resolution.",
    bn: "উপচে পড়া বিন, সংগ্রহ না হওয়া বা ভাঙা বিন দেখেছেন? আপনার ওয়ার্ড টিমকে জানান। প্রতিটি রিপোর্টের অগ্রগতি আপনি দেখতে পাবেন।",
  },
  "report.issueType": { en: "What is the problem?", bn: "সমস্যাটি কী?" },
  "report.whichBin": { en: "Which bin?", bn: "কোন বিন?" },
  "report.selectBin": { en: "Select the nearest bin", bn: "নিকটতম বিন নির্বাচন করুন" },
  "report.details": { en: "Tell us a little more", bn: "আরও কিছু বলুন" },
  "report.detailsPlaceholder": {
    en: "Add details that could help the collection team…",
    bn: "সংগ্রহ টিমকে সাহায্য করবে এমন তথ্য লিখুন…",
  },
  "report.privacy": {
    en: "Shared only with your ward team",
    bn: "শুধুমাত্র আপনার ওয়ার্ড টিমের সাথে শেয়ার করা হবে",
  },
  "report.successKicker": { en: "Report received", bn: "রিপোর্ট গৃহীত" },
  "report.successTitle": { en: "Thanks for looking out for your ward.", bn: "ধন্যবাদ, আপনার সচেতনতার জন্য।" },
  "report.trackWith": { en: "Track it with reference", bn: "ট্র্যাকিং নম্বর" },
  "report.another": { en: "Submit another report", bn: "আরেকটি রিপোর্ট" },
  "report.signInFirst": {
    en: "Sign in to file a report so you can track it",
    bn: "রিপোর্ট ট্র্যাক করতে সাইন ইন করুন",
  },
  "report.smsAlt": {
    en: "No smartphone? Send an SMS to 16263 in this format:",
    bn: "স্মার্টফোন নেই? ১৬২৬৩ নম্বরে এই ফরম্যাটে SMS করুন:",
  },

  /* my reports */
  "myReports.title": { en: "My reports", bn: "আমার রিপোর্ট" },
  "myReports.sub": {
    en: "Every report you have filed, and exactly where it stands.",
    bn: "আপনার সব রিপোর্ট এবং সেগুলোর বর্তমান অবস্থা।",
  },
  "myReports.empty": {
    en: "You have not filed any reports yet.",
    bn: "আপনি এখনো কোনো রিপোর্ট করেননি।",
  },
  "myReports.filed": { en: "Filed", bn: "জমা দেওয়া হয়েছে" },
  "myReports.resolved": { en: "Resolved", bn: "সমাধান হয়েছে" },
} as const;

export type StringKey = keyof typeof strings;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Lang) ?? "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* preference simply will not persist */
    }
  }, []);

  const t = useCallback((key: StringKey) => strings[key][lang] ?? strings[key].en, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Small en/বাং switch, styled by `.lang-toggle`. */
export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>
        EN
      </button>
      <button className={lang === "bn" ? "active" : ""} onClick={() => setLang("bn")}>
        বাংলা
      </button>
    </div>
  );
}
