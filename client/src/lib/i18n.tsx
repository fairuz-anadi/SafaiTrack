/**
 * Bilingual UI (English / বাংলা).
 *
 * A waste-reporting tool for Dhaka that only speaks English excludes most of
 * the people who live next to the bins — so the translation covers the whole
 * product, not just the citizen pages: navigation, dashboards, tables, empty
 * states, buttons and error copy all resolve through `t()`.
 *
 * Numerals stay Western. Bangladeshi municipal paperwork and vehicle plates
 * use them, and mixing ০-৯ into operational figures hurts more than it helps.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

export type Lang = "en" | "bn";

const STORAGE_KEY = "safaitrack_lang";

/** Every user-visible string in the product. */
const strings = {
  "routes.previewExplain": { en: "Preview and explain this plan", bn: "পরিকল্পনার প্রিভিউ ও ব্যাখ্যা" },
  "routes.previewOnly": { en: "Unsaved preview · modeled distance", bn: "অসংরক্ষিত প্রিভিউ · মডেলভিত্তিক দূরত্ব" },

  /* ── explainer mode ──────────────────────────────────────────────────── */
  "explainer.mode": { en: "Explainer mode", bn: "ব্যাখ্যা মোড" },
  "explainer.on": { en: "On", bn: "চালু" },
  "explainer.off": { en: "Off", bn: "বন্ধ" },
  "explainer.explaining": { en: "Explaining", bn: "ব্যাখ্যা করছি" },
  "explainer.clear": { en: "Clear selection", bn: "নির্বাচন মুছুন" },
  "explainer.hint": {
    en: "Explainer mode is on. Click any highlighted number or section to ask about it.",
    bn: "ব্যাখ্যা মোড চালু। যেকোনো চিহ্নিত সংখ্যা বা অংশে ক্লিক করে সেটি নিয়ে জিজ্ঞাসা করুন।",
  },
  "explainer.pickAnother": {
    en: "Click anything you'd like explained, or just ask about the dashboard.",
    bn: "যা বুঝতে চান তাতে ক্লিক করুন, অথবা ড্যাশবোর্ড নিয়েই জিজ্ঞাসা করুন।",
  },
  "explainer.reading": { en: "Looking at this number…", bn: "সংখ্যাটি দেখা হচ্ছে…" },
  "explainer.readingBoard": { en: "Looking at the dashboard…", bn: "ড্যাশবোর্ডটি দেখা হচ্ছে…" },
  "explainer.askMetric": { en: "Ask about this number…", bn: "এই সংখ্যাটি নিয়ে জিজ্ঞাসা করুন…" },
  "explainer.askBoard": { en: "Ask about this dashboard…", bn: "এই ড্যাশবোর্ড নিয়ে জিজ্ঞাসা করুন…" },
  "explainer.forecastPanel": { en: "Overflow outlook", bn: "ভরে যাওয়ার আউটলুক" },
  "explainer.impactPanel": { en: "Distance saved", bn: "সাশ্রয় হওয়া দূরত্ব" },
  "explainer.complaintsPanel": { en: "Open complaints", bn: "খোলা অভিযোগ" },
  "explainer.pressurePanel": { en: "Where the pressure is", bn: "চাপ কোথায়" },
  "agent.unavailable": { en: "The assistant is unavailable right now.", bn: "সহকারী এখন পাওয়া যাচ্ছে না।" },

  /* ── generic ─────────────────────────────────────────────────────────── */
  "common.back": { en: "Back to home", bn: "হোমে ফিরুন" },
  "common.cancel": { en: "Cancel", bn: "বাতিল" },
  "common.save": { en: "Save", bn: "সংরক্ষণ" },
  "common.close": { en: "Close", bn: "বন্ধ করুন" },
  "common.optional": { en: "Optional", bn: "ঐচ্ছিক" },
  "common.loading": { en: "Loading…", bn: "লোড হচ্ছে…" },
  "common.search": { en: "Search bins, routes, complaints", bn: "বিন, রুট, অভিযোগ খুঁজুন" },
  "common.all": { en: "All", bn: "সব" },
  "common.viewAll": { en: "View all", bn: "সব দেখুন" },
  "common.open": { en: "Open", bn: "খুলুন" },
  "common.none": { en: "None", bn: "নেই" },
  "common.today": { en: "Today", bn: "আজ" },
  "common.signOut": { en: "Sign out", bn: "সাইন আউট" },
  "common.notifications": { en: "Notifications", bn: "বিজ্ঞপ্তি" },
  "common.nothingYet": { en: "Nothing yet.", bn: "এখনো কিছু নেই।" },
  "common.ward": { en: "Ward", bn: "ওয়ার্ড" },
  "common.wards": { en: "wards", bn: "ওয়ার্ড" },
  "common.bins": { en: "bins", bn: "বিন" },
  "common.stops": { en: "stops", bn: "স্টপ" },
  /* Singular forms, for `tn()`. Bangla does not inflect these nouns for
     number, so only the English differs — but a call site should not have
     to know which languages that is true of. */
  "common.wardOne": { en: "ward", bn: "ওয়ার্ড" },
  "common.binOne": { en: "bin", bn: "বিন" },
  "common.stopOne": { en: "stop", bn: "স্টপ" },
  "common.critical": { en: "Critical", bn: "সংকটাপন্ন" },
  "common.watch": { en: "Watch", bn: "নজরে" },
  "common.high": { en: "High", bn: "উচ্চ" },
  "common.healthy": { en: "Healthy", bn: "স্বাভাবিক" },
  "common.status": { en: "Status", bn: "অবস্থা" },
  "common.distance": { en: "Distance", bn: "দূরত্ব" },
  "common.filed": { en: "Filed", bn: "জমা হয়েছে" },
  "common.resolved": { en: "Resolved", bn: "সমাধান হয়েছে" },
  "common.priority": { en: "Priority", bn: "অগ্রাধিকার" },
  "common.location": { en: "Location", bn: "অবস্থান" },
  "common.channel": { en: "Channel", bn: "মাধ্যম" },

  /* ── navigation ──────────────────────────────────────────────────────── */
  "nav.howItWorks": { en: "How it works", bn: "কীভাবে কাজ করে" },
  "nav.impact": { en: "Results", bn: "ফলাফল" },
  "nav.forCities": { en: "For cities", bn: "সিটির জন্য" },
  "nav.problem": { en: "The problem", bn: "সমস্যা" },
  "nav.report": { en: "Report a bin issue", bn: "সমস্যা জানান" },
  "nav.faq": { en: "Questions", bn: "প্রশ্ন" },
  "nav.reportShort": { en: "Report a bin", bn: "সমস্যা জানান" },
  "nav.signIn": { en: "Sign in", bn: "সাইন ইন" },
  "nav.dashboard": { en: "Open dashboard", bn: "ড্যাশবোর্ড খুলুন" },
  "nav.overview": { en: "Overview", bn: "সারসংক্ষেপ" },
  "nav.liveBins": { en: "Live bins", bn: "লাইভ বিন" },
  "nav.routes": { en: "Routes", bn: "রুট" },
  "nav.impactProof": { en: "Impact proof", bn: "প্রমাণিত প্রভাব" },
  "nav.complaints": { en: "Complaints", bn: "অভিযোগ" },
  "nav.fleet": { en: "Fleet", bn: "যানবহর" },
  "nav.analytics": { en: "Analytics", bn: "বিশ্লেষণ" },
  "nav.operations": { en: "Operations", bn: "কার্যক্রম" },
  "nav.insight": { en: "Insight", bn: "বিশ্লেষণ" },
  "nav.account": { en: "Account", bn: "অ্যাকাউন্ট" },
  "nav.simActive": { en: "Simulation live", bn: "সিমুলেশন চালু" },
  "nav.simPaused": { en: "Simulation paused", bn: "সিমুলেশন থামানো" },
  "nav.ward": { en: "Ward", bn: "ওয়ার্ড" },
  "nav.signedInAs": { en: "Signed in as", bn: "সাইন ইন করেছেন" },
  "nav.myReports": { en: "My reports", bn: "আমার রিপোর্ট" },
  "nav.settings": { en: "Settings", bn: "সেটিংস" },
  "nav.team": { en: "Team", bn: "টিম" },

  /* ── roles ───────────────────────────────────────────────────────────── */
  "role.citizen": { en: "Citizen", bn: "নাগরিক" },
  "role.staff": { en: "Municipal staff", bn: "সিটি কর্পোরেশন" },
  "role.driver": { en: "Truck driver", bn: "ট্রাক চালক" },
  "role.officer": { en: "Ward officer", bn: "ওয়ার্ড কর্মকর্তা" },

  "brand.kicker": { en: "THE NAME", bn: "নামের অর্থ" },
  "brand.meaning": {
    en: "Safai (সাফাই) is the Bangla word for cleaning — the work itself, done by hand, every day. Track is what has been missing: a record of where the waste is, who collected it, and when.",
    bn: "সাফাই মানে পরিচ্ছন্নতার কাজ — যা প্রতিদিন হাতে করা হয়। ট্র্যাক সেই জিনিসটি যা এতদিন ছিল না: কোথায় ময়লা, কে নিয়েছে, কখন নিয়েছে — তার হিসাব।",
  },
  "brand.markLabel": { en: "Safai Track — about the mark", bn: "সাফাই ট্র্যাক — লোগো সম্পর্কে" },
  "brand.partArcs": {
    en: "The two arcs are the signal — the bin reporting its own fill level.",
    bn: "দুটি বাঁকা রেখা হলো সংকেত — বিন নিজেই তার ভরাট মাত্রা জানাচ্ছে।",
  },
  "brand.partBin": {
    en: "The body is an ordinary municipal bin, not a futuristic one. The system works with what Dhaka already has.",
    bn: "দেহটি সাধারণ পৌর বিন, ভবিষ্যতের কোনো যন্ত্র নয়। ঢাকায় যা আছে তা নিয়েই ব্যবস্থাটি কাজ করে।",
  },
  "brand.partLines": {
    en: "The two inner lines are the record: measured, logged, answerable.",
    bn: "ভেতরের দুটি রেখা হলো হিসাব: মাপা, নথিভুক্ত, জবাবদিহিযোগ্য।",
  },
  "brand.tagline": { en: "Cleaning, on the record", bn: "পরিচ্ছন্নতা, হিসাবসহ" },
  /* ── landing ─────────────────────────────────────────────────────────── */
  "hero.eyebrow": {
    en: "Built for the wards that keep Dhaka moving",
    bn: "ঢাকাকে সচল রাখা ওয়ার্ডগুলোর জন্য তৈরি",
  },
  "hero.title1": { en: "Cleaner streets.", bn: "পরিচ্ছন্ন রাস্তা।" },
  "hero.title2": { en: "Smarter routes.", bn: "স্মার্ট রুট।" },
  "hero.body": {
    en: "SafaiTrack turns bin signals, citizen reports and collection routes into one calm command center for healthier neighbourhoods.",
    bn: "সাফাইট্র্যাক বিনের তথ্য, নাগরিকদের অভিযোগ এবং সংগ্রহের রুট একত্র করে একটি পরিচ্ছন্ন নিয়ন্ত্রণ কেন্দ্রে পরিণত করে।",
  },
  "hero.cta": { en: "Explore the dashboard", bn: "ড্যাশবোর্ড দেখুন" },
  "hero.hint": { en: "Click anywhere", bn: "যেকোনো জায়গায় ক্লিক করুন" },
  "hero.hintRest": { en: "— run a collection sweep", bn: "— সংগ্রহ শুরু হবে" },
  "hero.trust": {
    en: "Built for ward teams, drivers and citizens",
    bn: "ওয়ার্ড টিম, চালক ও নাগরিকদের জন্য",
  },
  "landing.outcome1": { en: "less collection distance", bn: "কম সংগ্রহ দূরত্ব" },
  "landing.outcome1sub": { en: "measured against the fixed schedule", bn: "নির্ধারিত সূচির তুলনায় পরিমাপকৃত" },
  "landing.outcome2": { en: "bins monitored live", bn: "বিন সরাসরি পর্যবেক্ষণে" },
  "landing.outcome2sub": { en: "across four Dhaka North wards", bn: "ঢাকা উত্তরের চারটি ওয়ার্ডে" },
  "landing.outcome3": { en: "average resolution time", bn: "গড় সমাধানের সময়" },
  "landing.outcome3sub": { en: "from citizen report to closed", bn: "অভিযোগ থেকে সমাধান পর্যন্ত" },

  "story.kicker": { en: "ONE SYSTEM, EVERY SIGNAL", bn: "এক সিস্টেম, সব তথ্য" },
  "story.title1": { en: "From overflow", bn: "উপচে পড়া থেকে" },
  "story.title2": { en: "to action.", bn: "পদক্ষেপে।" },
  "story.body": {
    en: "Collection should respond to what is happening now — not to a schedule written years ago. SafaiTrack closes that loop in four steps, without a single piece of new hardware in the field.",
    bn: "সংগ্রহ হওয়া উচিত এখনকার বাস্তবতা অনুযায়ী — বছর আগের সূচি অনুযায়ী নয়। সাফাইট্র্যাক চারটি ধাপে এই চক্র সম্পূর্ণ করে, মাঠে নতুন কোনো যন্ত্র ছাড়াই।",
  },
  "story.step1": { en: "Signals arrive", bn: "তথ্য আসে" },
  "story.step1body": {
    en: "Residents report a full bin from the web or by SMS and USSD from a basic phone, ward officers log what they find on their rounds, and drivers log every collection. A diurnal simulation stands in for the reading history a live deployment would accumulate. All three write to one table — the same shape a real ultrasonic sensor would use — so no bin needs hardware and a retrofit needs no redesign.",
    bn: "নাগরিকরা ওয়েব বা সাধারণ ফোনে SMS/USSD-এ ভরা বিনের খবর দেন, চালকরা প্রতিটি সংগ্রহ লিপিবদ্ধ করেন। দিনভিত্তিক সিমুলেশন বাকি ইতিহাস পূরণ করে। তিনটিই একই টেবিলে লেখে — কোনো বিনে যন্ত্র লাগে না।",
  },
  "story.step2": { en: "The system predicts", bn: "সিস্টেম পূর্বাভাস দেয়" },
  "story.step2body": {
    en: "Each bin's own fill rate is fitted from its reading history, projecting the hour it will overflow. Routes get planned before waste hits the street, not after someone complains about it.",
    bn: "প্রতিটি বিনের নিজস্ব ভরাট হার তার তথ্য-ইতিহাস থেকে হিসাব করা হয়, কখন উপচে পড়বে তা আগেই জানা যায়। ময়লা রাস্তায় পড়ার আগেই রুট পরিকল্পনা হয়।",
  },
  "story.step3": { en: "Routes optimize", bn: "রুট অপটিমাইজ হয়" },
  "story.step3body": {
    en: "Dijkstra shortest paths over the ward's road graph, a priority-weighted nearest neighbour construction, then a 2-opt refinement. Full bins come first; near-empty bins are skipped entirely.",
    bn: "ওয়ার্ডের সড়ক গ্রাফে ডাইক্সট্রা শর্টেস্ট পাথ, অগ্রাধিকার-ভিত্তিক নিকটতম প্রতিবেশী, তারপর ২-অপ্ট পরিশোধন। ভরা বিন আগে; প্রায় খালি বিন বাদ।",
  },
  "story.step4": { en: "Everyone is accountable", bn: "সবাই জবাবদিহি করে" },
  "story.step4body": {
    en: "Drivers log each collection. Every complaint status change is appended, never overwritten, and attributed to a named officer. Residents watch their own report move from filed to resolved.",
    bn: "চালকরা প্রতিটি সংগ্রহ নথিভুক্ত করেন। প্রতিটি অভিযোগের অবস্থা পরিবর্তন যুক্ত হয়, কখনো মুছে যায় না, এবং নির্দিষ্ট কর্মকর্তার নামে থাকে।",
  },

  "cities.kicker": { en: "FOR CITY TEAMS", bn: "সিটি কর্পোরেশনের জন্য" },
  "cities.title1": { en: "Smart-city results on a", bn: "স্মার্ট-সিটির ফলাফল," },
  "cities.title2": { en: "city-corporation budget.", bn: "সিটি কর্পোরেশনের বাজেটে।" },
  "cities.body": {
    en: "Commercial platforms deliver this by putting a sensor in every bin — which is exactly the cost most Bangladeshi city corporations cannot carry. SafaiTrack keeps the routing intelligence and drops the hardware bill, while leaving the schema ready for real sensors whenever they can be afforded.",
    bn: "বাণিজ্যিক প্ল্যাটফর্মগুলো প্রতিটি বিনে সেন্সর বসিয়ে এটি করে — যে খরচ বাংলাদেশের অধিকাংশ সিটি কর্পোরেশন বহন করতে পারে না। সাফাইট্র্যাক রুটিং বুদ্ধিমত্তা রাখে, যন্ত্রের খরচ বাদ দেয়।",
  },
  "cities.check1": { en: "No per-bin hardware, no connectivity contracts", bn: "প্রতি বিনে যন্ত্র নেই, ইন্টারনেট চুক্তি নেই" },
  "cities.check2": { en: "Runs offline on a single laptop when the network drops", bn: "নেটওয়ার্ক না থাকলেও একটি ল্যাপটপে চলে" },
  "cities.check3": { en: "Every saving figure is auditable, with stated constants", bn: "প্রতিটি সাশ্রয়ের হিসাব যাচাইযোগ্য" },
  "cities.check4": { en: "Bengali interface and an SMS channel for every resident", bn: "বাংলা ইন্টারফেস ও সবার জন্য SMS সুবিধা" },
  "cities.measured": { en: "Measured to date", bn: "এ পর্যন্ত পরিমাপকৃত" },
  "cities.routesScored": { en: "routes scored", bn: "রুট মূল্যায়িত" },
  "cities.distanceSaved": { en: "Distance saved", bn: "দূরত্ব সাশ্রয়" },
  "cities.costAvoided": { en: "Modeled cost reduction", bn: "খরচ সাশ্রয়" },
  "cities.co2Avoided": { en: "Modeled CO₂ reduction", bn: "CO₂ সাশ্রয়" },

  "final.kicker": { en: "READY WHEN YOU ARE", bn: "আপনি প্রস্তুত হলেই" },
  "final.title": { en: "Aligned with", bn: "সামঞ্জস্যপূর্ণ" },
  "final.title2": { en: "— and with the street outside your window.", bn: "— এবং আপনার জানালার বাইরের রাস্তার সাথে।" },
  "footer.tagline": {
    en: "Smart waste collection and route optimization for Dhaka neighbourhoods",
    bn: "ঢাকার এলাকার জন্য স্মার্ট বর্জ্য সংগ্রহ ও রুট অপটিমাইজেশন",
  },
  "footer.sdg": { en: "SDG 11 · Sustainable Cities and Communities", bn: "SDG ১১ · টেকসই নগর ও জনপদ" },

  "card.binsOnline": { en: "bins online", bn: "বিন সক্রিয়" },
  "card.forecastActive": { en: "Forecast active", bn: "পূর্বাভাস চালু" },
  "card.liveWardView": { en: "LIVE WARD VIEW", bn: "সরাসরি ওয়ার্ড চিত্র" },
  "card.todayAcross": { en: "Today across", bn: "আজকের চিত্র" },
  "card.cluster": { en: "Dhanmondi cluster", bn: "ধানমন্ডি ক্লাস্টার" },
  "card.saved": { en: "% saved", bn: "% সাশ্রয়" },
  "card.binsMonitored": { en: "Bins monitored", bn: "পর্যবেক্ষণে" },
  "card.needAttention": { en: "Need attention", bn: "মনোযোগ প্রয়োজন" },
  "card.activeRoutes": { en: "Active routes", bn: "সক্রিয় রুট" },
  "card.routeOptimized": { en: "Route optimized", bn: "রুট অপটিমাইজড" },
  "card.savedSoFar": { en: "saved so far", bn: "এ পর্যন্ত সাশ্রয়" },
  "card.generateToSee": { en: "Generate one to see the saving", bn: "সাশ্রয় দেখতে একটি রুট তৈরি করুন" },
  "card.smsReceived": { en: "SMS report received", bn: "SMS রিপোর্ট এসেছে" },
  "card.noSmartphone": { en: "No smartphone needed", bn: "স্মার্টফোন লাগে না" },
  "bins.perHour": { en: "per hour, learned from readings", bn: "প্রতি ঘণ্টায়, তথ্য থেকে শেখা" },
  "bins.confidence": { en: "confidence", bn: "নিশ্চয়তা" },
  "bins.onFile": { en: "readings on file", bn: "তথ্য সংরক্ষিত" },
  "bins.chartNote": {
    en: "Sharp drops are collections. The forecast is fitted only on the readings since the most recent one, so emptying the bin never drags its predicted fill rate negative.",
    bn: "খাড়া পতনগুলো সংগ্রহের সময়। পূর্বাভাস কেবল সর্বশেষ সংগ্রহের পরের তথ্য থেকে তৈরি, তাই বিন খালি করলে হার নেগেটিভ হয় না।",
  },
  "settings.assistantTools": { en: "Assistant tools", bn: "সহকারীর টুল" },
  "settings.readOnly": { en: "read-only", bn: "শুধু পঠনযোগ্য" },
  "roles.title1": { en: "Four people,", bn: "চার ভূমিকা," },
  "roles.title2": { en: "one system.", bn: "এক সিস্টেম।" },
  "roles.body": {
    en: "SafaiTrack is not one dashboard with permissions bolted on. Each role gets the view its job actually needs — and nothing it does not.",
    bn: "সাফাইট্র্যাক একটি মাত্র ড্যাশবোর্ড নয়। প্রতিটি ভূমিকা ঠিক যতটুকু প্রয়োজন ততটুকুই দেখে।",
  },
  "roles.noSensors": { en: "sensors installed", bn: "সেনসর বসানো হয়েছে" },
  /* ── the problem page ────────────────────────────────────────────────── */
  "about.kicker": { en: "THE PROBLEM", bn: "সমস্যা" },
  "about.title1": { en: "Dhaka's waste system runs", bn: "ঢাকার বর্জ্য ব্যবস্থা চলে" },
  "about.title2": { en: "on paper and memory.", bn: "কাগজ আর স্মৃতির উপর।" },
  "about.lead": {
    en: "Municipal collection follows fixed schedules that never change, regardless of how full a bin is. Two failures repeat: bins overflow onto streets for days, and trucks visit bins that are nearly empty.",
    bn: "পৌর সংগ্রহ চলে নির্ধারিত সূচি অনুযায়ী, বিন কতটা ভরা তা বিবেচনা না করেই। দুটি সমস্যা বারবার ঘটে: বিন দিনের পর দিন উপচে পড়ে, আর ট্রাক প্রায় খালি বিনেও যায়।",
  },
  "about.gapKicker": { en: "WHERE WE FIT", bn: "আমরা কোথায়" },
  "about.gapTitle": { en: "The missing middle", bn: "মাঝের শূন্যতা" },
  "about.gapBody": {
    en: "Global platforms are effective but assume a per-bin hardware budget. Dhaka has no digital coordination layer at all. SafaiTrack sits between the two.",
    bn: "বৈশ্বিক প্ল্যাটফর্মগুলো কার্যকর কিন্তু প্রতি বিনে যন্ত্রের বাজেট ধরে নেয়। ঢাকায় কোনো ডিজিটাল সমন্বয় স্তরই নেই। সাফাইট্র্যাক এই দুইয়ের মাঝে।",
  },
  "about.colGlobal": { en: "Global systems", bn: "বৈশ্বিক সিস্টেম" },
  "about.colDhaka": { en: "Dhaka today", bn: "আজকের ঢাকা" },
  "about.colOurs": { en: "SafaiTrack", bn: "সাফাইট্র্যাক" },
  "about.rowData": { en: "Bin data source", bn: "বিনের তথ্যের উৎস" },
  "about.rowRoute": { en: "Route planning", bn: "রুট পরিকল্পনা" },
  "about.rowCost": { en: "Upfront cost", bn: "প্রাথমিক খরচ" },
  "about.rowCitizen": { en: "Citizen involvement", bn: "নাগরিক অংশগ্রহণ" },
  "about.rowUpgrade": { en: "Upgrade path", bn: "উন্নয়নের পথ" },
  "about.sdgTitle": { en: "Why SDG 11", bn: "কেন SDG ১১" },
  "about.sdgBody": {
    en: "Waste collection, sanitation and municipal service delivery are core to building inclusive, safe and sustainable cities — and to reducing the per-capita environmental impact of urban areas.",
    bn: "বর্জ্য সংগ্রহ, স্যানিটেশন ও পৌরসেবা টেকসই ও নিরাপদ নগর গড়ার মূল উপাদান — এবং নগরের মাথাপিছু পরিবেশগত প্রভাব কমানোর চাবিকাঠি।",
  },

  /* ── auth ────────────────────────────────────────────────────────────── */
  "auth.signInKicker": { en: "SIGN IN", bn: "সাইন ইন" },
  "auth.welcome": { en: "Welcome back.", bn: "স্বাগতম।" },
  "auth.chooseRole": { en: "Who is signing in?", bn: "কে সাইন ইন করছেন?" },
  "auth.chooseRoleSub": {
    en: "Pick your role — the system only shows you what your job needs.",
    bn: "আপনার ভূমিকা বেছে নিন — সিস্টেম শুধু আপনার প্রয়োজনীয় অংশ দেখাবে।",
  },
  "auth.email": { en: "Email", bn: "ইমেইল" },
  "auth.password": { en: "Password", bn: "পাসওয়ার্ড" },
  "auth.showPassword": { en: "Show password", bn: "পাসওয়ার্ড দেখান" },
  "auth.hidePassword": { en: "Hide password", bn: "পাসওয়ার্ড লুকান" },
  "auth.signInBtn": { en: "Sign in", bn: "সাইন ইন করুন" },
  "auth.newResident": { en: "New resident?", bn: "নতুন বাসিন্দা?" },
  "auth.createAccount": { en: "Create an account", bn: "অ্যাকাউন্ট খুলুন" },
  "auth.alreadyRegistered": { en: "Already registered?", bn: "আগে থেকেই নিবন্ধিত?" },
  "auth.useDemo": { en: "Use the demo account", bn: "ডেমো অ্যাকাউন্ট ব্যবহার করুন" },
  "auth.demoNote": { en: "Fills the form for you — no typing needed.", bn: "ফর্ম নিজেই পূরণ হবে — টাইপ করতে হবে না।" },
  "auth.changeRole": { en: "Change role", bn: "ভূমিকা বদলান" },
  "auth.wrong": { en: "Email or password is incorrect", bn: "ইমেইল বা পাসওয়ার্ড ভুল" },
  "auth.registerKicker": { en: "CREATE ACCOUNT", bn: "অ্যাকাউন্ট খুলুন" },
  "auth.registerTitle": { en: "Join your ward.", bn: "আপনার ওয়ার্ডে যোগ দিন।" },
  "auth.registerSub": {
    en: "Residents only — municipal accounts are issued by the city corporation.",
    bn: "শুধু বাসিন্দাদের জন্য — পৌর অ্যাকাউন্ট সিটি কর্পোরেশন দেয়।",
  },
  "auth.fullName": { en: "Full name", bn: "পুরো নাম" },
  "auth.mobile": { en: "Mobile number — enables SMS reporting", bn: "মোবাইল নম্বর — SMS রিপোর্টিং চালু করে" },
  "auth.yourWard": { en: "Your ward", bn: "আপনার ওয়ার্ড" },
  "auth.selectWard": { en: "Select your ward", bn: "আপনার ওয়ার্ড নির্বাচন করুন" },
  "auth.address": { en: "Address", bn: "ঠিকানা" },
  "auth.addressPlaceholder": { en: "House, road, area", bn: "বাসা, রোড, এলাকা" },
  "auth.passwordRule": { en: "Password — at least 8 characters", bn: "পাসওয়ার্ড — কমপক্ষে ৮ অক্ষর" },
  "auth.createBtn": { en: "Create account", bn: "অ্যাকাউন্ট তৈরি করুন" },
  "auth.asideTitle1": { en: "Waste collection that", bn: "বর্জ্য সংগ্রহ যা" },
  "auth.asideTitle2": { en: "responds to the street.", bn: "রাস্তার বাস্তবতায় সাড়া দেয়।" },
  "auth.regAside1": { en: "One report can", bn: "একটি রিপোর্ট" },
  "auth.regAside2": { en: "move a whole route.", bn: "পুরো রুট বদলে দিতে পারে।" },
  "auth.regAsideBody": {
    en: "Register your ward so your reports reach the right officer, and so you can follow them from filed to resolved.",
    bn: "আপনার ওয়ার্ড নিবন্ধন করুন যাতে আপনার রিপোর্ট সঠিক কর্মকর্তার কাছে পৌঁছায় এবং অগ্রগতি দেখতে পারেন।",
  },
  "auth.regPoint1": { en: "Your ward officer sees your report the moment it is filed", bn: "জমা দেওয়ার সাথে সাথেই ওয়ার্ড কর্মকর্তা দেখতে পান" },
  "auth.regPoint2": { en: "Only you and your ward team can see your reports", bn: "শুধু আপনি ও আপনার ওয়ার্ড টিম দেখতে পারবে" },
  "auth.roleStaffWhat": { en: "Full operations, routing and impact", bn: "সম্পূর্ণ কার্যক্রম, রুটিং ও প্রভাব" },
  "auth.roleOfficerWhat": { en: "Complaints inside your ward", bn: "আপনার ওয়ার্ডের অভিযোগ" },
  "auth.roleDriverWhat": { en: "Your assigned route, on your phone", bn: "আপনার নির্ধারিত রুট, আপনার ফোনে" },
  "auth.roleCitizenWhat": { en: "Report a problem and track it", bn: "সমস্যা জানান ও অগ্রগতি দেখুন" },

  /* ── dashboard ───────────────────────────────────────────────────────── */
  "dash.greeting": { en: "Good day", bn: "শুভদিন" },
  "dash.liveOps": { en: "LIVE OPERATIONS", bn: "সরাসরি কার্যক্রম" },
  "dash.title1": { en: "Your wards,", bn: "আপনার ওয়ার্ড," },
  "dash.title2": { en: "in motion.", bn: "সচল।" },
  "dash.sub": {
    en: "A live view of the waste network across Dhaka North. Prioritise what matters, then move.",
    bn: "ঢাকা উত্তরের বর্জ্য নেটওয়ার্কের সরাসরি চিত্র। যা জরুরি তা আগে করুন।",
  },
  "dash.optimizeWorst": { en: "Optimize worst ward", bn: "সবচেয়ে খারাপ ওয়ার্ড অপটিমাইজ করুন" },
  "dash.optimizing": { en: "Optimizing…", bn: "অপটিমাইজ হচ্ছে…" },
  "dash.binsMonitored": { en: "Bins monitored", bn: "পর্যবেক্ষণে থাকা বিন" },
  "dash.binsMonitoredSub": { en: "average fill across", bn: "গড় ভরাট," },
  "dash.needAttention": { en: "Need attention", bn: "মনোযোগ প্রয়োজন" },
  "dash.needAttentionSub": { en: "of them already overflowing", bn: "টি ইতিমধ্যে উপচে পড়ছে" },
  "dash.activeRoutes": { en: "Active routes", bn: "সক্রিয় রুট" },
  "dash.activeRoutesSub": { en: "planned in total", bn: "মোট পরিকল্পিত" },
  "dash.avgResolution": { en: "Avg. resolution", bn: "গড় সমাধান" },
  "dash.avgResolutionSub": { en: "complaints still open", bn: "অভিযোগ এখনো খোলা" },
  "dash.wardNetwork": { en: "WARD NETWORK", bn: "ওয়ার্ড নেটওয়ার্ক" },
  "dash.liveBinIntel": { en: "Live bin intelligence", bn: "সরাসরি বিন তথ্য" },
  "dash.allBins": { en: "All bins", bn: "সব বিন" },
  "dash.realCoords": { en: "Real Dhaka coordinates", bn: "প্রকৃত ঢাকার স্থানাঙ্ক" },
  "dash.selectBin": { en: "Select a bin to inspect details", bn: "বিস্তারিত দেখতে একটি বিন নির্বাচন করুন" },
  "dash.fillLevel": { en: "Fill level", bn: "ভরাটের মাত্রা" },
  "dash.overflowsIn": { en: "Overflows in", bn: "উপচে পড়বে" },
  "dash.emptied": { en: "emptied", bn: "খালি হয়েছে" },
  "dash.measuredImpact": { en: "MEASURED IMPACT", bn: "পরিমাপকৃত প্রভাব" },
  "dash.vsFixed": { en: "Versus fixed schedule", bn: "নির্ধারিত সূচির তুলনায়" },
  "dash.distanceSaved": { en: "Distance saved", bn: "দূরত্ব সাশ্রয়" },
  "dash.averagedOver": { en: "averaged over", bn: "গড়," },
  "dash.scoredRoutes": { en: "scored routes", bn: "মূল্যায়িত রুট" },
  "dash.fuelNotBurned": { en: "Fuel not burned", bn: "জ্বালানি সাশ্রয়" },
  "dash.costAvoided": { en: "Modeled cost reduction", bn: "খরচ সাশ্রয়" },
  "dash.co2Avoided": { en: "Modeled CO₂ reduction", bn: "CO₂ সাশ্রয়" },
  "dash.seeProof": { en: "See the full proof", bn: "সম্পূর্ণ প্রমাণ দেখুন" },
  "dash.forecastKicker": { en: "OVERFLOW FORECAST", bn: "উপচে পড়ার পূর্বাভাস" },
  "dash.next8": { en: "Next 8 hours", bn: "পরবর্তী ৮ ঘণ্টা" },
  "dash.noForecast": {
    en: "No bin is projected to overflow in the next 8 hours. Run the simulation forward to see the forecast react.",
    bn: "আগামী ৮ ঘণ্টায় কোনো বিন উপচে পড়ার সম্ভাবনা নেই। সিমুলেশন এগিয়ে নিয়ে পূর্বাভাস দেখুন।",
  },
  "dash.predictedFrom": { en: "Predicted from each bin's own fill rate", bn: "প্রতিটি বিনের নিজস্ব ভরাট হার থেকে অনুমিত" },
  "dash.citizenSignals": { en: "CITIZEN SIGNALS", bn: "নাগরিকদের বার্তা" },
  "dash.latestComplaints": { en: "Latest complaints", bn: "সাম্প্রতিক অভিযোগ" },
  "dash.noComplaints": { en: "No complaints filed yet.", bn: "এখনো কোনো অভিযোগ জমা পড়েনি।" },
  "dash.leagueKicker": { en: "WARD LEAGUE TABLE", bn: "ওয়ার্ড তালিকা" },
  "dash.wherePressure": { en: "Where the pressure is", bn: "কোথায় চাপ বেশি" },
  "dash.left": { en: "left", bn: "বাকি" },

  /* ── simulation ──────────────────────────────────────────────────────── */
  "sim.clock": { en: "Simulation clock", bn: "সিমুলেশন ঘড়ি" },
  "sim.tick": { en: "tick", bn: "টিক" },
  "sim.step30": { en: "30 min", bn: "৩০ মিনিট" },
  "sim.skip6": { en: "Skip 6 hours", bn: "৬ ঘণ্টা এগিয়ে যান" },
  "sim.runDay": { en: "Run a full day", bn: "পুরো দিন চালান" },
  "sim.note": {
    en: "Bins fill on their own learned rates with a morning and evening peak. Run a day to watch the network drift into crisis, then generate a route against it.",
    bn: "বিনগুলো নিজস্ব হারে ভরে, সকাল ও সন্ধ্যায় সবচেয়ে বেশি। একদিন চালিয়ে দেখুন নেটওয়ার্ক কীভাবে সংকটে পড়ে, তারপর রুট তৈরি করুন।",
  },
  "sim.advancedTo": { en: "Advanced to tick", bn: "এগিয়েছে টিক" },
  "sim.binsUpdated": { en: "bins updated", bn: "বিন হালনাগাদ" },
  "sim.overflowing": { en: "overflowing", bn: "উপচে পড়ছে" },
  "sim.newlyCritical": { en: "newly critical, worst:", bn: "নতুন সংকটাপন্ন, সবচেয়ে খারাপ:" },

  /* ── bins ────────────────────────────────────────────────────────────── */
  "bins.title": { en: "Live bins", bn: "লাইভ বিন" },
  "bins.eyebrow": { en: "BIN NETWORK", bn: "বিন নেটওয়ার্ক" },
  "bins.allWards": { en: "All wards", bn: "সব ওয়ার্ড" },
  /* ── registering a newly installed bin ── */
  "bins.addBin": { en: "Add a bin", bn: "নতুন বিন যোগ করুন" },
  "bins.addTitle": { en: "Register an installed bin", bn: "বসানো বিন নিবন্ধন করুন" },
  "bins.pickOnMap": { en: "Click the map to place the bin first", bn: "আগে মানচিত্রে জায়গা দিন" },
  "bins.placed": { en: "Placed at", bn: "বসানো হয়েছে" },
  "bins.landmarkLabel": { en: "Landmark", bn: "স্থানের নাম" },
  "bins.capacityLabel": { en: "Capacity (litres)", bn: "ক্ষমতা (লিটার)" },
  "bins.streamLabel": { en: "Waste stream", bn: "বর্জ্যের ধরন" },
  "bins.saveBin": { en: "Register bin", bn: "নিবন্ধন করুন" },
  "bins.addFailed": { en: "Could not register that bin", bn: "বিনটি যোগ করা যায়নি" },
  "bins.addIntro": {
    en: "Click the bin's position on the map, then fill in the rest. Its code is generated from the ward.",
    bn: "মানচিত্রে বিনের জায়গায় ক্লিক করুন, তারপর বাকি তথ্য দিন।",
  },
  "bins.newBinNote": {
    en: "A new bin has no history, so its forecast stays low-confidence until a few reports arrive.",
    bn: "নতুন বিনের ইতিহাস নেই, তাই কয়েকটি প্রতিবেদন না আসা পর্যন্ত পূর্বাভাস অনিশ্চিত থাকবে।",
  },
  "bins.refit": { en: "Refit forecasts", bn: "পূর্বাভাস হালনাগাদ" },
  "bins.geography": { en: "GEOGRAPHY", bn: "ভূগোল" },
  "bins.onMap": { en: "bins on the map", bn: "বিন মানচিত্রে" },
  "bins.predictedOverflow": { en: "PREDICTED OVERFLOW", bn: "পূর্বাভাসিত উপচে পড়া" },
  "bins.next24": { en: "Next 24 hours", bn: "পরবর্তী ২৪ ঘণ্টা" },
  "bins.nothingSoon": { en: "Nothing is projected to overflow within a day.", bn: "একদিনের মধ্যে কিছু উপচে পড়ার সম্ভাবনা নেই।" },
  "bins.inventory": { en: "INVENTORY", bn: "তালিকা" },
  "bins.allBins": { en: "All bins", bn: "সব বিন" },
  "bins.noMatch": { en: "No bins match this filter.", bn: "এই ফিল্টারে কোনো বিন নেই।" },
  "bins.code": { en: "Code", bn: "কোড" },
  "bins.landmark": { en: "Landmark", bn: "চিহ্ন" },
  "bins.category": { en: "Category", bn: "শ্রেণি" },
  "bins.capacity": { en: "Capacity", bn: "ধারণক্ষমতা" },
  "bins.fill": { en: "Fill", bn: "ভরাট" },
  "bins.rate": { en: "Rate", bn: "হার" },
  "bins.overflowsIn": { en: "Overflows in", bn: "উপচে পড়বে" },
  "bins.lastEmptied": { en: "Last emptied", bn: "শেষ খালি" },
  "bins.readingHistory": { en: "Reading history", bn: "তথ্যের ইতিহাস" },
  "bins.detailKicker": { en: "BIN DETAIL", bn: "বিনের বিবরণ" },
  "bins.recentReadings": { en: "Recent fill reports", bn: "সাম্প্রতিক প্রতিবেদন" },
  "bins.observedRecently": { en: "Observed just now", bn: "এইমাত্র দেখা হয়েছে" },
  "bins.observedAgo": { en: "Observed {hours}h ago", bn: "{hours} ঘণ্টা আগে দেখা হয়েছে" },
  "bins.neverObserved": { en: "No report on file", bn: "কোনো প্রতিবেদন নেই" },
  "bins.source": { en: "Source", bn: "উৎস" },
  "bins.recordedAt": { en: "Recorded", bn: "নথিভুক্ত" },
  "bins.backToBins": { en: "Back to all bins", bn: "সব বিনে ফিরুন" },

  /* ── routes ──────────────────────────────────────────────────────────── */
  "routes.title": { en: "Collection routes", bn: "সংগ্রহের রুট" },
  "routes.eyebrow": { en: "ROUTE OPTIMIZATION", bn: "রুট অপটিমাইজেশন" },
  "routes.generate": { en: "GENERATE", bn: "তৈরি করুন" },
  "routes.planRun": { en: "Plan a collection run", bn: "একটি সংগ্রহ পরিকল্পনা করুন" },
  "routes.collectAbove": { en: "Collect at or above", bn: "সংগ্রহ করুন এর উপরে" },
  "routes.maxStops": { en: "Max stops", bn: "সর্বোচ্চ স্টপ" },
  "routes.lookahead": { en: "Forecast lookahead (h)", bn: "পূর্বাভাস সময়সীমা (ঘণ্টা)" },
  "routes.generateBtn": { en: "Generate route", bn: "রুট তৈরি করুন" },
  "routes.eligibilityNote": {
    en: "Bins are eligible if they are already at the threshold or forecast to overflow within the lookahead window — that second clause is what makes the route proactive rather than purely reactive.",
    bn: "যে বিনগুলো ইতিমধ্যে সীমায় পৌঁছেছে অথবা নির্ধারিত সময়ের মধ্যে উপচে পড়বে বলে পূর্বাভাস আছে, সেগুলো অন্তর্ভুক্ত হয় — এটিই রুটকে আগাম পরিকল্পিত করে তোলে।",
  },
  "routes.history": { en: "HISTORY", bn: "ইতিহাস" },
  "routes.generated": { en: "Generated routes", bn: "তৈরি হওয়া রুট" },
  "routes.none": { en: "No routes generated yet. Plan one above.", bn: "এখনো কোনো রুট তৈরি হয়নি। উপরে পরিকল্পনা করুন।" },
  "routes.vsBaseline": { en: "vs baseline", bn: "বেসলাইনের তুলনায়" },
  "routes.estTime": { en: "Est. time", bn: "আনুমানিক সময়" },
  "routes.assigned": { en: "Assigned", bn: "নিয়োগকৃত" },
  "routes.unassigned": { en: "Unassigned", bn: "নিয়োগ হয়নি" },
  "routes.twoRoutes": { en: "THE TWO ROUTES", bn: "দুটি রুট" },
  "routes.optimizedVs": { en: "Optimized against fixed schedule", bn: "নির্ধারিত সূচির বিপরীতে অপটিমাইজড" },
  "routes.hideBaseline": { en: "Hide baseline", bn: "বেসলাইন লুকান" },
  "routes.showBaseline": { en: "Show baseline", bn: "বেসলাইন দেখান" },
  "routes.optimized": { en: "Optimized", bn: "অপটিমাইজড" },
  "routes.fixedSchedule": { en: "Fixed schedule", bn: "নির্ধারিত সূচি" },
  "routes.dispatch": { en: "DISPATCH", bn: "প্রেরণ" },
  "routes.truck": { en: "Truck", bn: "ট্রাক" },
  "routes.driver": { en: "Driver", bn: "চালক" },
  "routes.assignDispatch": { en: "Assign and dispatch", bn: "নিয়োগ ও প্রেরণ করুন" },
  "routes.startRoute": { en: "Start route", bn: "রুট শুরু করুন" },
  "routes.progress": { en: "Progress", bn: "অগ্রগতি" },
  "routes.collected": { en: "collected", bn: "সংগৃহীত" },
  "routes.stopSequence": { en: "STOP SEQUENCE", bn: "স্টপের ক্রম" },
  "routes.stopsInOrder": { en: "stops in order", bn: "স্টপ ক্রমানুসারে" },
  "routes.shorterThan": {
    en: "shorter than the fixed schedule over the same ward",
    bn: "একই ওয়ার্ডে নির্ধারিত সূচির চেয়ে কম",
  },

  /* ── impact ──────────────────────────────────────────────────────────── */
  "impact.title": { en: "Impact proof", bn: "প্রমাণিত প্রভাব" },
  "impact.eyebrow": { en: "MEASURED, NOT CLAIMED", bn: "পরিমাপকৃত, দাবি নয়" },
  "impact.question": { en: "Does optimized routing actually save anything?", bn: "অপটিমাইজড রুটিং কি সত্যিই সাশ্রয় করে?" },
  "impact.lead": {
    en: "Every time a route is generated, SafaiTrack also computes what the legacy fixed schedule would have done over the same ward, at the same moment, with the same truck. The difference below is that comparison — not an estimate, and not a figure borrowed from a paper.",
    bn: "প্রতিবার রুট তৈরির সময় সাফাইট্র্যাক হিসাব করে পুরনো নির্ধারিত সূচি একই ওয়ার্ডে, একই সময়ে, একই ট্রাক দিয়ে কী করত। নিচের পার্থক্যটি সেই তুলনা — কোনো অনুমান নয়।",
  },
  "impact.noRoutes": {
    en: "No routes have been scored yet. Generate a route from the dashboard and its baseline comparison appears here automatically.",
    bn: "এখনো কোনো রুট মূল্যায়িত হয়নি। ড্যাশবোর্ড থেকে একটি রুট তৈরি করুন, তুলনা এখানে দেখা যাবে।",
  },
  "impact.lessDistance": { en: "less distance driven than the fixed schedule, averaged across", bn: "নির্ধারিত সূচির চেয়ে কম দূরত্ব, গড়" },
  "impact.fuelSaved": { en: "Modeled fuel saving", bn: "জ্বালানি সাশ্রয়" },
  "impact.wastedStops": { en: "Wasted stops skipped", bn: "অপ্রয়োজনীয় স্টপ বাদ" },
  "impact.todayPractice": { en: "Today's practice — fixed schedule", bn: "বর্তমান পদ্ধতি — নির্ধারিত সূচি" },
  "impact.todayPracticeSub": {
    en: "Visit every bin in the ward, in a static order, regardless of fill.",
    bn: "ওয়ার্ডের প্রতিটি বিনে যান, নির্দিষ্ট ক্রমে, ভরাট যাই হোক।",
  },
  "impact.oursTitle": { en: "SafaiTrack — demand-driven", bn: "সাফাইট্র্যাক — চাহিদাভিত্তিক" },
  "impact.oursSub": {
    en: "Dijkstra shortest paths, priority-weighted nearest neighbour, 2-opt refinement.",
    bn: "ডাইক্সট্রা শর্টেস্ট পাথ, অগ্রাধিকার-ভিত্তিক নিকটতম প্রতিবেশী, ২-অপ্ট পরিশোধন।",
  },
  "impact.stopsMade": { en: "Stops made", bn: "স্টপ সম্পন্ন" },
  "impact.dieselBurned": { en: "Diesel burned", bn: "ডিজেল খরচ" },
  "impact.stopsUnder": { en: "Stops at bins under", bn: "এর কম ভরা বিনে স্টপ" },
  "impact.criticalReached": { en: "Critical bins reached", bn: "সংকটাপন্ন বিনে পৌঁছানো" },
  "impact.routeByRoute": { en: "ROUTE BY ROUTE", bn: "রুট অনুযায়ী" },
  "impact.distanceBoth": { en: "Distance, both ways", bn: "দূরত্ব, দুই পদ্ধতিতে" },
  "impact.everyRoute": { en: "EVERY SCORED ROUTE", bn: "প্রতিটি মূল্যায়িত রুট" },
  "impact.fullRecord": { en: "The full record", bn: "সম্পূর্ণ নথি" },
  "impact.annualSaving": { en: "Projected annual saving", bn: "বার্ষিক প্রক্ষেপিত সাশ্রয়" },
  "impact.annualCo2": { en: "Projected annual CO₂", bn: "বার্ষিক প্রক্ষেপিত CO₂" },
  "impact.dieselPrice": { en: "Diesel price used", bn: "ব্যবহৃত ডিজেল মূল্য" },
  "impact.benchmark": { en: "Literature benchmark", bn: "গবেষণার মানদণ্ড" },
  "impact.wardRuns": { en: "ward-runs / year", bn: "ওয়ার্ড-চালনা / বছর" },
  "impact.avoidedAll": { en: "avoided across all wards", bn: "সব ওয়ার্ডে সাশ্রয়" },
  "impact.retailRate": { en: "Bangladesh retail rate", bn: "বাংলাদেশের খুচরা দর" },
  "impact.pooledMean": { en: "pooled mean, IoT routing meta-analysis", bn: "IoT রুটিং মেটা-বিশ্লেষণের গড়" },

  /* ── complaints ──────────────────────────────────────────────────────── */
  "comp.title": { en: "Citizen complaints", bn: "নাগরিক অভিযোগ" },
  "comp.eyebrow": { en: "ACCOUNTABILITY DESK", bn: "জবাবদিহি ডেস্ক" },
  "comp.queue": { en: "QUEUE", bn: "তালিকা" },
  "comp.count": { en: "complaints", bn: "অভিযোগ" },
  "comp.noMatch": { en: "No complaints match this filter.", bn: "এই ফিল্টারে কোনো অভিযোগ নেই।" },
  "comp.selectOne": { en: "Select a complaint to see its full audit trail.", bn: "সম্পূর্ণ নথি দেখতে একটি অভিযোগ নির্বাচন করুন।" },
  "comp.reportedBy": { en: "Reported by", bn: "জানিয়েছেন" },
  "comp.bin": { en: "Bin", bn: "বিন" },
  "comp.wardLevel": { en: "Ward-level", bn: "ওয়ার্ড পর্যায়ে" },
  "comp.remark": { en: "Remark for the audit trail", bn: "নথির জন্য মন্তব্য" },
  "comp.remarkPlaceholder": { en: "What did you do?", bn: "আপনি কী করেছেন?" },
  "comp.markAs": { en: "Mark", bn: "চিহ্নিত করুন" },
  "comp.closed": { en: "This complaint is closed. The trail below is permanent.", bn: "এই অভিযোগ বন্ধ। নিচের নথি স্থায়ী।" },
  "comp.auditTrail": { en: "AUDIT TRAIL", bn: "নথি" },
  "comp.appendOnly": { en: "Append-only history", bn: "শুধু যুক্ত হওয়া ইতিহাস" },

  /* ── fleet ───────────────────────────────────────────────────────────── */
  "fleet.title": { en: "Fleet", bn: "যানবহর" },
  "fleet.eyebrow": { en: "TRUCKS AND DRIVERS", bn: "ট্রাক ও চালক" },
  "fleet.vehicles": { en: "VEHICLES", bn: "যানবাহন" },
  "fleet.trucks": { en: "trucks", bn: "ট্রাক" },
  "fleet.available": { en: "available", bn: "প্রস্তুত" },
  "fleet.plate": { en: "Plate", bn: "নম্বর প্লেট" },
  "fleet.vehicle": { en: "Vehicle", bn: "যান" },
  "fleet.homeWard": { en: "Home ward", bn: "নিজ ওয়ার্ড" },
  "fleet.odometer": { en: "Odometer", bn: "ওডোমিটার" },
  "fleet.fuelUse": { en: "Fuel use", bn: "জ্বালানি ব্যবহার" },
  "fleet.crew": { en: "CREW", bn: "কর্মী" },
  "fleet.drivers": { en: "drivers", bn: "চালক" },
  "fleet.free": { en: "Free", bn: "মুক্ত" },
  "fleet.onRoute": { en: "On route", bn: "রুটে" },
  "fleet.noTrucks": { en: "No trucks registered.", bn: "কোনো ট্রাক নিবন্ধিত নেই।" },
  "fleet.shift": { en: "shift", bn: "শিফট" },

  /* ── analytics ───────────────────────────────────────────────────────── */
  "an.title": { en: "Analytics", bn: "বিশ্লেষণ" },
  "an.eyebrow": { en: "OPERATIONAL TRENDS", bn: "কার্যক্রমের প্রবণতা" },
  "an.fillTrend": { en: "FILL TREND", bn: "ভরাটের প্রবণতা" },
  "an.filled72": { en: "How the network filled over 72 hours", bn: "৭২ ঘণ্টায় নেটওয়ার্ক কীভাবে ভরেছে" },
  "an.trendNote": {
    en: "Every point is an hourly aggregate of the fill reports on record — citizen submissions, officer inspections, driver collections and simulated ticks. The morning and evening peaks are the market and meal-prep cycles the model reproduces.",
    bn: "প্রতিটি বিন্দু রেকর্ডে থাকা প্রতিবেদনের ঘণ্টাভিত্তিক গড় — নাগরিক প্রতিবেদন, চালকের সংগ্রহ ও সিমুলেটেড টিক। সকাল ও সন্ধ্যার শীর্ষ বাজার ও রান্নার সময়ের প্রতিফলন।",
  },
  "an.avgFill": { en: "Average fill", bn: "গড় ভরাট" },
  "an.fullestBin": { en: "Fullest bin", bn: "সবচেয়ে ভরা বিন" },
  "an.complaintsKicker": { en: "COMPLAINTS", bn: "অভিযোগ" },
  "an.volumeByType": { en: "Volume and resolution time by type", bn: "ধরন অনুযায়ী সংখ্যা ও সমাধানের সময়" },
  "an.type": { en: "Type", bn: "ধরন" },
  "an.avgResolution": { en: "Avg. resolution", bn: "গড় সমাধান" },
  "an.channelKicker": { en: "REPORTING CHANNEL", bn: "রিপোর্টের মাধ্যম" },
  "an.howReach": { en: "How residents reach us", bn: "বাসিন্দারা কীভাবে জানান" },
  "an.withoutSmartphone": { en: "arrived without a smartphone", bn: "স্মার্টফোন ছাড়াই এসেছে" },
  "an.leagueKicker": { en: "WARD LEAGUE TABLE", bn: "ওয়ার্ড তালিকা" },
  "an.pressureByWard": { en: "Service pressure by ward", bn: "ওয়ার্ড অনুযায়ী সেবার চাপ" },
  "an.overflowHours": { en: "Overflow hours", bn: "উপচে পড়া ঘণ্টা" },
  "an.open": { en: "Open", bn: "খোলা" },

  /* ── driver ──────────────────────────────────────────────────────────── */
  "driver.role": { en: "Driver", bn: "চালক" },
  "driver.noRoute": { en: "No route assigned", bn: "কোনো রুট নেই" },
  "driver.noRouteBody": {
    en: "No route is assigned to you right now. Municipal staff will dispatch one shortly.",
    bn: "এখন আপনার কোনো রুট নেই। সিটি কর্পোরেশন শীঘ্রই রুট পাঠাবে।",
  },
  "driver.completedBefore": { en: "routes completed previously", bn: "রুট আগে সম্পন্ন হয়েছে" },
  "driver.collected": { en: "Collected", bn: "সংগ্রহ হয়েছে" },
  "driver.done": { en: "Done", bn: "সম্পন্ন" },
  "driver.full": { en: "full", bn: "ভরা" },
  "driver.routeComplete": { en: "Route complete — all stops logged", bn: "রুট সম্পন্ন — সব স্টপ নথিভুক্ত" },

  /* ── citizen report ──────────────────────────────────────────────────── */
  "report.kicker": { en: "Citizen portal", bn: "নাগরিক পোর্টাল" },
  "report.title1": { en: "Help keep your", bn: "আপনার এলাকা" },
  "report.title2": { en: "neighbourhood clean.", bn: "পরিচ্ছন্ন রাখতে সাহায্য করুন।" },
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
  "report.privacy": { en: "Shared only with your ward team", bn: "শুধুমাত্র আপনার ওয়ার্ড টিমের সাথে" },
  "report.trackProgress": { en: "Track progress from submitted to resolved", bn: "জমা থেকে সমাধান পর্যন্ত ট্র্যাক করুন" },
  "report.submit": { en: "Submit report", bn: "রিপোর্ট পাঠান" },
  "report.successKicker": { en: "Report received", bn: "রিপোর্ট গৃহীত" },
  "report.successTitle": { en: "Thanks for looking out for your ward.", bn: "ধন্যবাদ, আপনার সচেতনতার জন্য।" },
  "report.trackWith": { en: "Track it with reference", bn: "ট্র্যাকিং নম্বর" },
  "report.another": { en: "Submit another report", bn: "আরেকটি রিপোর্ট" },
  "report.signInFirst": { en: "Sign in to file a report so you can track it", bn: "রিপোর্ট ট্র্যাক করতে সাইন ইন করুন" },
  "report.smsAlt": {
    en: "No smartphone? Send an SMS to 16263 in this format:",
    bn: "স্মার্টফোন নেই? ১৬২৬৩ নম্বরে এই ফরম্যাটে SMS করুন:",
  },
  "report.smsBangla": {
    en: "Bangla works too. You get the same tracking reference.",
    bn: "বাংলাতেও পাঠাতে পারেন। একই ট্র্যাকিং নম্বর পাবেন।",
  },
  "report.chooseBin": { en: "Please choose the bin you are reporting.", bn: "অনুগ্রহ করে একটি বিন নির্বাচন করুন।" },
  "report.step": { en: "STEP 1 OF 1", bn: "ধাপ ১ / ১" },
  "report.footerNote": { en: "One report can move a whole route.", bn: "একটি রিপোর্ট পুরো রুট বদলে দিতে পারে।" },

  /* ── my reports ──────────────────────────────────────────────────────── */
  /* ── track a report without an account ─────────────────────────────── */
  "track.sub": {
    en: "Reported a bin by SMS or from the web? Enter the phone number you used and we will show you exactly where it stands. No account needed.",
    bn: "SMS বা ওয়েবে বিনের অভিযোগ করেছেন? যে নম্বর থেকে জানিয়েছিলেন সেটি দিন — কোনো অ্যাকাউন্ট লাগবে না।",
  },
  "track.label": { en: "Your phone number", bn: "আপনার ফোন নম্বর" },
  "track.submit": { en: "Find my reports", bn: "আমার অভিযোগ দেখুন" },
  "track.hint": {
    en: "The same number you texted from. You can also reply STATUS <code> to 16263 from any phone.",
    bn: "যে নম্বর থেকে SMS করেছিলেন সেটিই। যেকোনো ফোন থেকে 16263-এ STATUS <কোড> লিখেও জানা যায়।",
  },
  "track.noneFound": {
    en: "No reports on file for that number. Check the digits, or file a new one.",
    bn: "এই নম্বরে কোনো অভিযোগ নেই। নম্বরটি মিলিয়ে দেখুন।",
  },
  "track.badNumber": {
    en: "That does not look like a Bangladeshi mobile number — try 11 digits starting 01.",
    bn: "এটি বাংলাদেশি মোবাইল নম্বর মনে হচ্ছে না — 01 দিয়ে শুরু ১১ অঙ্ক।",
  },
  "myReports.title": { en: "My reports", bn: "আমার রিপোর্ট" },
  "myReports.sub": {
    en: "Every report you have filed, and exactly where it stands.",
    bn: "আপনার সব রিপোর্ট এবং সেগুলোর বর্তমান অবস্থা।",
  },
  "myReports.empty": { en: "You have not filed any reports yet.", bn: "আপনি এখনো কোনো রিপোর্ট করেননি।" },
  "myReports.progress": { en: "PROGRESS", bn: "অগ্রগতি" },

  /* ── profile ─────────────────────────────────────────────────────────── */
  "profile.title": { en: "Profile", bn: "প্রোফাইল" },
  "profile.eyebrow": { en: "YOUR ACCOUNT", bn: "আপনার অ্যাকাউন্ট" },
  "profile.editable": { en: "EDITABLE", bn: "সম্পাদনাযোগ্য" },
  "profile.yourDetails": { en: "Your details", bn: "আপনার তথ্য" },
  "profile.identity": { en: "IDENTITY", bn: "পরিচয়" },
  "profile.managedByCity": { en: "Managed by the city", bn: "সিটি কর্পোরেশন নিয়ন্ত্রিত" },
  "profile.employeeNo": { en: "Employee number", bn: "কর্মচারী নম্বর" },
  "profile.designation": { en: "Designation", bn: "পদবি" },
  "profile.license": { en: "Licence number", bn: "লাইসেন্স নম্বর" },
  "profile.shift": { en: "Shift", bn: "শিফট" },
  "profile.memberSince": { en: "Member since", bn: "যোগদান" },
  "profile.saved": { en: "Saved", bn: "সংরক্ষিত" },
  "profile.lockNote": {
    en: "Your email and role are not editable here. An email change is an identity change and a role change is a privilege change — both go through the city corporation.",
    bn: "ইমেইল ও ভূমিকা এখানে পরিবর্তন করা যায় না। এগুলো সিটি কর্পোরেশনের মাধ্যমে পরিবর্তন করতে হয়।",
  },
  "profile.contribution": { en: "CONTRIBUTION", bn: "অবদান" },
  "profile.yourReports": { en: "Your reports", bn: "আপনার রিপোর্ট" },
  "profile.filed": { en: "Filed", bn: "জমা" },
  "profile.confirmed": { en: "Confirmed", bn: "নিশ্চিত" },
  "profile.trust": { en: "Trust", bn: "আস্থা" },
  "profile.trustNote": {
    en: "Trust rises when a ward officer confirms one of your reports. Higher-trust reports are prioritised in the queue.",
    bn: "ওয়ার্ড কর্মকর্তা আপনার রিপোর্ট নিশ্চিত করলে আস্থা বাড়ে। বেশি আস্থার রিপোর্ট আগে অগ্রাধিকার পায়।",
  },
  "nav.profile": { en: "Profile", bn: "প্রোফাইল" },

  /* ── landing: extra sections ─────────────────────────────────────────── */
  /* ── live route card ─────────────────────────────────────────────────── */
  "live.routeLabel": { en: "LIVE ROUTE", bn: "চলমান রুট" },
  "live.legendRoute": { en: "Efficient route", bn: "কার্যকর রুট" },
  "live.legendAlert": { en: "Overflow alert", bn: "উপচে পড়ার সতর্কতা" },
  "live.legendStop": { en: "Collection stop", bn: "সংগ্রহ স্টপ" },
  "live.offlineMap": { en: "OFFLINE MAP", bn: "অফলাইন মানচিত্র" },
  "live.noRoute": { en: "No route in flight", bn: "চলমান কোনো রুট নেই" },
  "live.noRouteBody": {
    en: "Generate one from the optimizer and it appears here.",
    bn: "অপটিমাইজার থেকে একটি তৈরি করলে এখানে দেখা যাবে।",
  },
  "live.runLedger": { en: "RUN LEDGER", bn: "রানের হিসাব" },
  "live.stopLog": { en: "STOP LOG", bn: "স্টপের তালিকা" },
  "live.noStops": { en: "No stops on this run yet.", bn: "এই রানে এখনো কোনো স্টপ নেই।" },
  "live.ledgerStops": { en: "Stops", bn: "স্টপ" },
  "live.ledgerDistance": { en: "Distance", bn: "দূরত্ব" },
  "live.ledgerBaseline": { en: "Fixed schedule", bn: "নির্ধারিত সূচি" },
  "live.ledgerSaved": { en: "Distance saved", bn: "দূরত্ব সাশ্রয়" },
  "live.ledgerFuel": { en: "Fuel avoided", bn: "জ্বালানি সাশ্রয়" },
  "live.ledgerCost": { en: "Modeled cost reduction", bn: "খরচ সাশ্রয়" },
  "live.ledgerTime": { en: "Estimated time", bn: "আনুমানিক সময়" },

  /* ── landing: the route engine ───────────────────────────────────────── */
  "engine.kicker": { en: "THE ROUTE ENGINE", bn: "রুট ইঞ্জিন" },
  "engine.title1": { en: "Less empty road.", bn: "কম খালি রাস্তা।" },
  "engine.title2": { en: "More useful motion.", bn: "বেশি কার্যকর চলাচল।" },
  "engine.body": {
    en: "SafaiTrack treats each ward as a living map. Simulated signals surface demand, then route logic chooses the next best stop — not the next stop on an old spreadsheet.",
    bn: "সাফাইট্র্যাক প্রতিটি ওয়ার্ডকে একটি জীবন্ত মানচিত্র হিসেবে দেখে। তথ্য চাহিদা দেখায়, তারপর রুট যুক্তি পরবর্তী সেরা স্টপ বেছে নেয় — পুরনো তালিকার পরের স্টপ নয়।",
  },
  "engine.mode": { en: "OPTIMIZATION MODE", bn: "অপটিমাইজেশন মোড" },
  "engine.modeShortest": { en: "Shortest path", bn: "সংক্ষিপ্ততম পথ" },
  "engine.modeNearest": { en: "Nearest neighbor", bn: "নিকটতম প্রতিবেশী" },
  "engine.distanceAvoided": { en: "DISTANCE AVOIDED", bn: "দূরত্ব সাশ্রয়" },
  "engine.vsFixed": { en: "vs. fixed schedule", bn: "নির্ধারিত সূচির তুলনায়" },
  "engine.priorityStops": { en: "PRIORITY STOPS", bn: "অগ্রাধিকার স্টপ" },
  "engine.above80": { en: "above 80% fill", bn: "৮০% এর বেশি ভরা" },
  "engine.cta": { en: "Generate a ward route", bn: "একটি ওয়ার্ড রুট তৈরি করুন" },
  "engine.dhakaNorth": { en: "DHAKA NORTH", bn: "ঢাকা উত্তর" },
  "engine.priorityMap": { en: "Priority map", bn: "অগ্রাধিকার মানচিত্র" },
  "engine.algorithm": { en: "ALGORITHM", bn: "অ্যালগরিদম" },
  "engine.ready": { en: "ROUTE READY", bn: "রুট প্রস্তুত" },
  "engine.computing": { en: "COMPUTING", bn: "গণনা চলছে" },
  "engine.tagOverflow": { en: "Overflow signal", bn: "উপচে পড়ার সংকেত" },
  "engine.tagSequenced": { en: "Stops sequenced", bn: "স্টপ ক্রমবদ্ধ" },
  "engine.tagAvoided": { en: "Stops avoided", bn: "স্টপ এড়ানো" },

  "gallery.kicker": { en: "ON THE GROUND", bn: "মাঠের বাস্তবতা" },
  "gallery.title1": { en: "This is the street", bn: "এই রাস্তাটাই" },
  "gallery.title2": { en: "the system is for.", bn: "সিস্টেমের লক্ষ্য।" },
  "gallery.body": {
    en: "Four moments in one collection cycle. Every screen in SafaiTrack exists to move a ward from the first picture to the last.",
    bn: "একটি সংগ্রহ চক্রের চারটি মুহূর্ত। সাফাইট্র্যাকের প্রতিটি স্ক্রিন আছে একটি ওয়ার্ডকে প্রথম ছবি থেকে শেষ ছবিতে নেওয়ার জন্য।",
  },
  "gallery.g1": { en: "The bin passes capacity", bn: "বিন ধারণক্ষমতা ছাড়ায়" },
  "gallery.g1b": { en: "Waste reaches the footpath before anyone is dispatched.", bn: "কেউ পৌঁছানোর আগেই ময়লা ফুটপাতে পৌঁছে যায়।" },
  "gallery.g2": { en: "A resident reports it", bn: "একজন বাসিন্দা জানান" },
  "gallery.g2b": { en: "Web, SMS or USSD — all three produce the same tracked record.", bn: "ওয়েব, SMS বা USSD — তিনটিতেই একই নথি তৈরি হয়।" },
  "gallery.g3": { en: "A route is generated", bn: "রুট তৈরি হয়" },
  "gallery.g3b": { en: "Full bins first, near-empty bins skipped, distance minimised.", bn: "ভরা বিন আগে, খালি বিন বাদ, দূরত্ব সর্বনিম্ন।" },
  "gallery.g4": { en: "The street is clear", bn: "রাস্তা পরিষ্কার" },
  "gallery.g4b": { en: "The collection is logged and the resident sees it resolved.", bn: "সংগ্রহ নথিভুক্ত হয় এবং বাসিন্দা সমাধান দেখতে পান।" },
  "gallery.note": {
    en: "These are original illustrations. Replace them with your own photographs by dropping files into client/public/images.",
    bn: "এগুলো মৌলিক চিত্র। client/public/images ফোল্ডারে নিজের ছবি রাখলে সেগুলো দেখা যাবে।",
  },

  "day.kicker": { en: "A DAY IN THE WARD", bn: "ওয়ার্ডের একটি দিন" },
  "day.title1": { en: "Waste does not arrive", bn: "ময়লা সারাদিন" },
  "day.title2": { en: "at a steady rate.", bn: "সমান হারে জমে না।" },
  "day.body": {
    en: "Bins fill in bursts — the morning market, then the evening meal. A schedule written once cannot see that. The system models it, so the truck arrives when the bin is actually full.",
    bn: "বিন ভরে ঢেউয়ের মতো — সকালের বাজার, তারপর সন্ধ্যার রান্না। একবার লেখা সূচি তা দেখতে পায় না। সিস্টেম এটি হিসাব করে, তাই ট্রাক ঠিক সময়ে পৌঁছায়।",
  },
  "day.t1": { en: "Overnight", bn: "রাতভর" },
  "day.t1body": { en: "Almost nothing accumulates. A fixed route would still send a truck.", bn: "প্রায় কিছুই জমে না। নির্ধারিত রুটে তবুও ট্রাক যেত।" },
  "day.t2": { en: "Morning market", bn: "সকালের বাজার" },
  "day.t2body": { en: "Organic waste spikes. Market bins fill fastest in the whole network.", bn: "জৈব বর্জ্য বাড়ে। বাজারের বিন সবচেয়ে দ্রুত ভরে।" },
  "day.t3": { en: "Midday", bn: "দুপুর" },
  "day.t3body": { en: "The forecast projects which bins will cross 100% before dusk.", bn: "পূর্বাভাস বলে কোন বিন সন্ধ্যার আগে ভরে যাবে।" },
  "day.t4": { en: "Evening peak", bn: "সন্ধ্যার শীর্ষ" },
  "day.t4body": { en: "The heaviest hours. A route generated now reaches the bins that matter.", bn: "সবচেয়ে ব্যস্ত সময়। এখন তৈরি রুট জরুরি বিনগুলোতে পৌঁছায়।" },

  "cap.kicker": { en: "WHAT IT DOES", bn: "কী করে" },
  "cap.title1": { en: "Six things,", bn: "ছয়টি কাজ," },
  "cap.title2": { en: "one system.", bn: "এক সিস্টেম।" },
  "cap.c1": { en: "Demand-driven routing", bn: "চাহিদাভিত্তিক রুটিং" },
  "cap.c1b": { en: "Dijkstra, priority nearest-neighbour and 2-opt over the ward road graph.", bn: "ওয়ার্ডের সড়ক গ্রাফে ডাইক্সট্রা, অগ্রাধিকার-ভিত্তিক প্রতিবেশী ও ২-অপ্ট।" },
  "cap.c2": { en: "Overflow forecasting", bn: "উপচে পড়ার পূর্বাভাস" },
  "cap.c2b": { en: "Per-bin regression on reading history, with a stated confidence.", bn: "প্রতিটি বিনের তথ্য থেকে রিগ্রেশন, নিশ্চয়তাসহ।" },
  "cap.c3": { en: "Citizen reporting", bn: "নাগরিক রিপোর্ট" },
  "cap.c3b": { en: "Web, SMS and USSD — the same record and reference from all three.", bn: "ওয়েব, SMS ও USSD — তিনটিতেই একই নথি ও নম্বর।" },
  "cap.c4": { en: "Append-only audit", bn: "অপরিবর্তনীয় নথি" },
  "cap.c4b": { en: "Every status change is added, never overwritten, and attributed.", bn: "প্রতিটি পরিবর্তন যুক্ত হয়, মুছে যায় না, এবং নামসহ থাকে।" },
  "cap.c5": { en: "Measured savings", bn: "পরিমাপকৃত সাশ্রয়" },
  "cap.c5b": { en: "Each route is scored against the schedule it replaces, with the maths shown.", bn: "প্রতিটি রুট পুরনো সূচির সাথে তুলনা করা হয়, হিসাবসহ।" },
  "cap.c6": { en: "Operations assistant", bn: "কার্যক্রম সহকারী" },
  "cap.c6b": { en: "Reads the live database to answer questions. Cannot dispatch anything.", bn: "সরাসরি ডেটাবেস পড়ে উত্তর দেয়। কিছু পাঠাতে পারে না।" },

  "faq.kicker": { en: "STRAIGHT ANSWERS", bn: "সরাসরি উত্তর" },
  "faq.title": { en: "The questions we get asked.", bn: "যে প্রশ্নগুলো করা হয়।" },
  "faq.q1": { en: "Is the saving real, or did you pick the number?", bn: "সাশ্রয়ের হিসাব কি সত্যি?" },
  "faq.a1": {
    en: "It is computed. Every route is scored against a fixed-schedule route over the same ward, at the same moment, with the same truck. Published field deployments average closer to 12% than our simulated 25% — we say so on the impact page.",
    bn: "এটি হিসাব করা। প্রতিটি রুট একই ওয়ার্ডে, একই সময়ে, একই ট্রাক দিয়ে পুরনো সূচির সাথে তুলনা করা হয়। বাস্তব প্রয়োগে গড় প্রায় ১২%, আমাদের সিমুলেশনে ২৫% — প্রভাব পাতায় তা বলা আছে।",
  },
  "faq.q2": { en: "Why not use real sensors?", bn: "প্রকৃত সেন্সর কেন নয়?" },
  "faq.a2": {
    en: "Cost is the most cited barrier in the IoT waste literature, and it is why Dhaka still runs on paper — but it is not the only one. A unit in an unattended public bin is exposed to theft, vandalism and monsoon, and every dead unit is a blind spot nobody notices. Residents reporting by web and SMS cost nothing per bin and cannot be prised off a wall. The readings table is shaped exactly like a real ultrasonic feed, so a retrofit changes one enum value, not the schema.",
    bn: "খরচই প্রধান বাধা, আর সে কারণেই ঢাকা এখনো কাগজে চলে — কিন্তু একমাত্র বাধা নয়। প্রকাশ্য বিনে বসানো যন্ত্র চুরি, ভাংচুর ও বর্ষার মুখে পড়ে, আর নষ্ট যন্ত্র একটি অদৃশ্য শূন্যতা তৈরি করে। ওয়েব ও SMS-এ নাগরিকদের প্রতিবেদনে প্রতি বিনে খরচ নেই। তথ্য-টেবিল প্রকৃত সেনসরের মতোই, তাই রিট্রোফিটে শুধু একটি মান বদলায়।",
  },
  "faq.q3": { en: "What happens if the internet drops?", bn: "ইন্টারনেট না থাকলে কী হয়?" },
  "faq.a3": {
    en: "Everything keeps working. The database is a local file, the assistant falls back to an offline advisor and says so, and the map keeps plotting exact bin positions without street tiles.",
    bn: "সবকিছু চলতে থাকে। ডেটাবেস স্থানীয় ফাইল, সহকারী অফলাইন মোডে যায় এবং তা জানায়, আর মানচিত্র বিনের সঠিক অবস্থান দেখাতে থাকে।",
  },
  "faq.q4": { en: "What does not work yet?", bn: "কী এখনো কাজ করে না?" },
  "faq.a4": {
    en: "Photo upload has no object storage behind it, the SMS endpoint is real but has no paid gateway, and road distance uses a documented 1.35 detour factor rather than routed geometry.",
    bn: "ছবি আপলোডের স্টোরেজ নেই, SMS এন্ডপয়েন্ট আছে কিন্তু গেটওয়ে নেই, আর সড়ক দূরত্বে ১.৩৫ গুণক ব্যবহার করা হয়েছে।",
  },

  /* ── settings ────────────────────────────────────────────────────────── */
  "settings.title": { en: "Settings", bn: "সেটিংস" },
  "settings.eyebrow": { en: "YOUR ACCOUNT", bn: "আপনার অ্যাকাউন্ট" },
  "settings.profile": { en: "PROFILE", bn: "প্রোফাইল" },
  "settings.yourDetails": { en: "Your details", bn: "আপনার তথ্য" },
  "settings.name": { en: "Name", bn: "নাম" },
  "settings.role": { en: "Role", bn: "ভূমিকা" },
  "settings.language": { en: "LANGUAGE", bn: "ভাষা" },
  "settings.choose": { en: "Choose your language", bn: "আপনার ভাষা বেছে নিন" },
  "settings.langNote": {
    en: "Applies across the whole product and is remembered on this device. Signed-in accounts keep the preference on the server too.",
    bn: "পুরো সিস্টেমে প্রযোজ্য এবং এই ডিভাইসে মনে রাখা হয়। সাইন ইন করা অ্যাকাউন্টে সার্ভারেও সংরক্ষিত থাকে।",
  },
  "settings.system": { en: "SYSTEM", bn: "সিস্টেম" },
  "settings.about": { en: "About this build", bn: "এই সংস্করণ সম্পর্কে" },
  "settings.aiEngine": { en: "AI assistant engine", bn: "AI সহকারী ইঞ্জিন" },
  "settings.database": { en: "Database", bn: "ডেটাবেস" },
  "settings.offlineAdvisor": { en: "Offline advisor", bn: "অফলাইন উপদেষ্টা" },

  /* ── assistant ───────────────────────────────────────────────────────── */
  "agent.launch": { en: "Ask SafaiTrack", bn: "সাফাইট্র্যাককে জিজ্ঞাসা করুন" },
  "agent.title": { en: "Operations assistant", bn: "কার্যক্রম সহকারী" },
  "agent.intro": {
    en: "Ask about bin status, overflow forecasts, complaints, the fleet, or measured savings. Every answer is read live from the operations database.",
    bn: "বিনের অবস্থা, পূর্বাভাস, অভিযোগ, যানবহর বা সাশ্রয় সম্পর্কে জিজ্ঞাসা করুন। প্রতিটি উত্তর সরাসরি ডেটাবেস থেকে আসে।",
  },
  "agent.placeholder": { en: "Ask about bins, routes or savings…", bn: "বিন, রুট বা সাশ্রয় সম্পর্কে জিজ্ঞাসা করুন…" },
  "agent.reading": { en: "Reading the operations data…", bn: "তথ্য পড়া হচ্ছে…" },
  "agent.offline": { en: "offline advisor", bn: "অফলাইন উপদেষ্টা" },
  "agent.q1": { en: "What needs my attention right now?", bn: "এখন কীসে মনোযোগ দেওয়া দরকার?" },
  "agent.q2": { en: "Which bins will overflow in the next 6 hours?", bn: "আগামী ৬ ঘণ্টায় কোন বিন উপচে পড়বে?" },
  "agent.q3": { en: "How much have we actually saved so far?", bn: "এ পর্যন্ত আমরা কতটা সাশ্রয় করেছি?" },
  "agent.q4": { en: "Plan a collection route for the worst ward", bn: "সবচেয়ে খারাপ ওয়ার্ডের জন্য রুট তৈরি করুন" },

  /* ── waste streams / segregation ─────────────────────────────────────── */
  "streams.kicker": { en: "WHICH BIN", bn: "কোন বিনে" },
  "streams.title1": { en: "Four streams,", bn: "চার ধরনের বর্জ্য," },
  "streams.title2": { en: "four bins.", bn: "চারটি বিন।" },
  "streams.body": {
    en: "A route that arrives on time at a bin full of mixed waste has still lost the recyclable and composted the plastic. Every bin in the system is registered to one stream, and the colour on these cards is the same colour the operations map paints that bin.",
    bn: "মিশ্র বর্জ্যে ভরা বিনে সময়মতো ট্রাক পৌঁছালেও পুনর্ব্যবহারযোগ্য জিনিস নষ্ট হয়ে যায়। সিস্টেমের প্রতিটি বিন একটি নির্দিষ্ট ধারার সঙ্গে নিবন্ধিত, আর এই কার্ডের রঙই মানচিত্রে সেই বিনের রঙ।",
  },
  "streams.avgFill": { en: "average fill", bn: "গড় ভরাট" },
  "streams.hazardous": { en: "Hazardous", bn: "বিপজ্জনক" },
  "streams.photoAlt": { en: "A {stream} collection bin", bn: "{stream} সংগ্রহের বিন" },
  "streams.yardKicker": { en: "WHERE IT GOES", bn: "এরপর কোথায়" },
  "streams.yardTitle": {
    en: "The recyclable stream is sorted by hand.",
    bn: "পুনর্ব্যবহারযোগ্য বর্জ্য হাতে বাছাই করা হয়।",
  },
  "streams.yardBody": {
    en: "General waste goes to Amin Bazar. Recyclable does not — it goes to a sorting yard, where people separate paper, plastic and metal by hand. Getting the stream right at the bin is what decides whether that work is possible at all, which is why the category is recorded against every bin rather than inferred later.",
    bn: "সাধারণ বর্জ্য যায় আমিন বাজারে। পুনর্ব্যবহারযোগ্য বর্জ্য যায় বাছাই কেন্দ্রে, যেখানে মানুষ হাতে কাগজ, প্লাস্টিক ও ধাতু আলাদা করেন। বিনেই সঠিক ধারা বেছে নেওয়ার উপরেই নির্ভর করে সেই কাজ আদৌ সম্ভব কি না — তাই প্রতিটি বিনের সঙ্গে ধারাটি নথিভুক্ত থাকে।",
  },
  "streams.yardAlt": {
    en: "Recovered plastic being sorted by hand at a yard",
    bn: "বাছাই কেন্দ্রে হাতে প্লাস্টিক আলাদা করা হচ্ছে",
  },
  "streams.note": {
    en: "Stream names, colours and handling notes are read from the waste-category table, not written into this page — change one in the database and it changes here.",
    bn: "ধারার নাম, রঙ ও নির্দেশনা ডেটাবেসের ওয়েস্ট-ক্যাটাগরি টেবিল থেকে আসে, এই পাতায় লেখা নেই — ডেটাবেসে বদলালে এখানেও বদলাবে।",
  },

  /* ── live wire (landing ticker) ──────────────────────────────────────── */
  "wire.label": { en: "Live wire", bn: "লাইভ ওয়্যার" },
  "wire.critical": { en: "Bins over the critical line", bn: "সংকটসীমা পেরোনো বিন" },
  "wire.avgFill": { en: "Average fill across the network", bn: "নেটওয়ার্কে গড় ভরাট" },
  "wire.worstWard": { en: "Under most pressure: {ward}", bn: "সবচেয়ে চাপে: {ward}" },
  "wire.routes": { en: "Collection routes running now", bn: "এখন চলমান সংগ্রহ রুট" },
  "wire.saved": { en: "Distance saved against the fixed schedule", bn: "নির্ধারিত সূচির তুলনায় দূরত্ব সাশ্রয়" },
  "wire.cost": { en: "Fuel cost avoided so far", bn: "এ পর্যন্ত জ্বালানি খরচ সাশ্রয়" },
  "wire.complaints": { en: "Citizen reports still open", bn: "এখনো খোলা নাগরিক অভিযোগ" },
  "wire.resolution": { en: "Mean time to resolve a report", bn: "অভিযোগ সমাধানে গড় সময়" },
  "wire.simLive": { en: "Simulation running", bn: "সিমুলেশন চলছে" },
  "wire.simPaused": { en: "Simulation paused at", bn: "সিমুলেশন থেমে আছে" },

  /* ── team ────────────────────────────────────────────────────────────── */
  "team.kicker": { en: "THE TEAM", bn: "টিম" },
  "team.supervisors": { en: "SUPERVISED BY", bn: "তত্ত্বাবধানে" },
  "team.course": { en: "COURSE", bn: "কোর্স" },
  "team.courseNo": { en: "Course number", bn: "কোর্স নম্বর" },
  "team.courseName": { en: "Course name", bn: "কোর্সের নাম" },
  "team.section": { en: "Lab section", bn: "ল্যাব সেকশন" },
  "team.group": { en: "Group", bn: "গ্রুপ" },
  "team.sdg": { en: "SDG alignment", bn: "SDG সংযোগ" },
  "team.note": {
    en: "Everything on this site runs against a live database — the numbers on the impact page are computed from routes the system actually planned, not typed in.",
    bn: "এই সাইটের সবকিছু একটি সচল ডেটাবেসের উপর চলে — প্রভাব পাতার সংখ্যাগুলো সিস্টেমের তৈরি করা রুট থেকে হিসাব করা, হাতে লেখা নয়।",
  },
  "team.title": { en: "Built by three students in Dhaka.", bn: "ঢাকার তিনজন শিক্ষার্থীর তৈরি।" },
  "team.body": {
    en: "SafaiTrack began as a Software Development coursework project and grew into a working system aimed at a problem all three of us walk past every day.",
    bn: "সাফাইট্র্যাক শুরু হয়েছিল একটি কোর্স প্রকল্প হিসেবে, পরে এমন একটি সমস্যার সমাধানে কার্যকর সিস্টেমে পরিণত হয়েছে যা আমরা প্রতিদিন দেখি।",
  },
} as const;

export type StringKey = keyof typeof strings;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key. Supports `{name}` placeholders via `vars`. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /**
   * Pick a label that agrees with a count: `1 bin`, `21 bins`.
   *
   * Interpolating a number in front of a plural-only string is fine until the
   * number is one, and several counts here legitimately reach one — a ward
   * with a single medical-waste bin, a route with a single stop.
   */
  tn: (n: number, one: StringKey, many: StringKey) => string;
  /** True when the current language is Bangla — for conditional layout. */
  isBn: boolean;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "bn" || stored === "en" ? stored : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    // Bangla script needs a little more line height to stay readable.
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* preference simply will not persist on this device */
    }
    // Persist for signed-in users so the choice follows them to another device.
    void api.patch("/auth/me/language", { preferredLanguage: l }).catch(() => {
      /* signed out, or offline — the local preference still applies */
    });
  }, []);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const entry = strings[key];
      let text: string = entry ? entry[lang] ?? entry.en : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [lang]
  );

  const tn = useCallback(
    (n: number, one: StringKey, many: StringKey) => t(n === 1 ? one : many),
    [t]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, tn, isBn: lang === "bn" }),
    [lang, setLang, t, tn]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Small EN / বাংলা switch, styled by `.lang-toggle`. */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        className={lang === "en" ? "active" : ""}
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
      >
        {compact ? "EN" : "English"}
      </button>
      <button
        className={lang === "bn" ? "active" : ""}
        onClick={() => setLang("bn")}
        aria-pressed={lang === "bn"}
      >
        বাংলা
      </button>
    </div>
  );
}
