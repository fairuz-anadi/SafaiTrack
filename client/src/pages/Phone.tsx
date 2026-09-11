/**
 * The citizen's phone, on screen.
 *
 * The SMS and WhatsApp channels are real webhooks, but a webhook is invisible
 * in a demo: until now the only way to show one working was a curl command
 * typed into a terminal. This page is a phone. Pick a channel, type what a
 * resident would type, and the reply comes back from the same endpoint a
 * real gateway would call — then the report is on the staff dashboard.
 *
 * Nothing here is mocked. WhatsApp messages are posted to /api/intake/whatsapp
 * in the exact shape Meta's Cloud API delivers, SMS to /api/intake/sms in the
 * shape an aggregator posts. The page is public because both endpoints are:
 * open it on an actual phone on the venue wifi and hand it to a judge.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUpRight, MessageSquareText, Phone as PhoneIcon, SendHorizontal, Signal, Wifi } from "lucide-react";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
import { LanguageToggle, useI18n } from "@/lib/i18n";

type Channel = "whatsapp" | "sms";

interface Bubble {
  id: number;
  who: "citizen" | "system";
  text: string;
  at: Date;
  code?: string;
  failed?: boolean;
}

/** The four residents the seed registers, so a judge can start from any of them. */
const RESIDENTS = [
  { phone: "01911000000", name: "Rumana Akter", ward: "DNCC-27 · Dhanmondi" },
  { phone: "01911000001", name: "Tanvir Hasan", ward: "DNCC-16 · Kalabagan" },
  { phone: "01911000002", name: "Shirin Sultana", ward: "DNCC-32 · Lalmatia" },
  { phone: "01911000003", name: "Imran Chowdhury", ward: "DNCC-27 · Dhanmondi" },
];

const COPY = {
  kicker: { en: "CITIZEN CHANNEL · LIVE DEMO", bn: "নাগরিক চ্যানেল · লাইভ ডেমো" },
  title: { en: "Report a bin from any phone.", bn: "যেকোনো ফোন থেকে বিনের অভিযোগ।" },
  lead: {
    en: "This is the resident's side of SafaiTrack. A message to the municipal WhatsApp number, or a plain SMS from a basic phone, becomes a tracked complaint on the staff dashboard within a second — same record, same audit trail, same tracking code.",
    bn: "এটি SafaiTrack-এর বাসিন্দার দিক। পৌরসভার WhatsApp নম্বরে একটি বার্তা, বা সাধারণ ফোন থেকে একটি SMS — এক সেকেন্ডের মধ্যে স্টাফ ড্যাশবোর্ডে ট্র্যাকযোগ্য অভিযোগ হয়ে যায়। একই রেকর্ড, একই অডিট ট্রেইল, একই ট্র্যাকিং কোড।",
  },
  howTitle: { en: "What a resident can send", bn: "একজন বাসিন্দা যা পাঠাতে পারেন" },
  how: [
    { cmd: "BIN W27-B001 FULL", en: "That bin is overflowing", bn: "ওই বিনটি উপচে পড়ছে" },
    { cmd: "MISSED W27-B002", en: "The truck skipped this bin", bn: "ট্রাক এই বিনটি বাদ দিয়ে গেছে" },
    { cmd: "BROKEN W27-B003", en: "The bin is damaged", bn: "বিনটি ভাঙা" },
    { cmd: "ময়লা উপচে পড়ছে", en: "Free text in Bangla — matched to the nearest bin", bn: "বাংলায় সাধারণ লেখা — নিকটতম বিনে মিলিয়ে নেওয়া হয়" },
    { cmd: "STATUS CMP-2087", en: "Track a report", bn: "অভিযোগের অবস্থা জানুন" },
    { cmd: "REG 27", en: "Register a new number in ward 27", bn: "ওয়ার্ড ২৭-এ নতুন নম্বর নিবন্ধন" },
  ],
  thenTitle: { en: "Then, on the staff side", bn: "এরপর, স্টাফের দিকে" },
  then: {
    en: "Sign in as municipal staff. The report is already on the dashboard under Citizen signals, and on the Complaints page with its channel tagged. Assign it, mark it in progress, resolve it — every step is written to the audit trail the resident can query by texting STATUS.",
    bn: "পৌর স্টাফ হিসেবে সাইন ইন করুন। অভিযোগটি ইতিমধ্যে ড্যাশবোর্ডের নাগরিক সংকেত অংশে এবং অভিযোগ পাতায় চ্যানেল ট্যাগসহ আছে। বরাদ্দ করুন, চলমান করুন, সমাধান করুন — প্রতিটি ধাপ অডিট ট্রেইলে লেখা হয়, যা বাসিন্দা STATUS লিখে জানতে পারেন।",
  },
  openDashboard: { en: "Open the staff dashboard", bn: "স্টাফ ড্যাশবোর্ড খুলুন" },
  from: { en: "Sending as", bn: "প্রেরক" },
  numberHint: { en: "Any other 01x number gets the REG flow.", bn: "অন্য যেকোনো 01x নম্বরে REG প্রক্রিয়া চলবে।" },
  placeholder: { en: "Type a message…", bn: "বার্তা লিখুন…" },
  empty: {
    en: "No messages yet. Tap a suggestion or type your own.",
    bn: "এখনো কোনো বার্তা নেই। একটি পরামর্শে ট্যাপ করুন বা নিজে লিখুন।",
  },
  filed: { en: "Filed as", bn: "নথিভুক্ত হয়েছে" },
  offline: { en: "No reply — is the API running?", bn: "উত্তর নেই — API চালু আছে কি?" },
  whatsappName: { en: "Dhaka City Corporation", bn: "ঢাকা সিটি কর্পোরেশন" },
  smsName: { en: "SafaiTrack · 16xxx", bn: "SafaiTrack · 16xxx" },
  channelNote: {
    whatsapp: {
      en: "Posted to /api/intake/whatsapp in the payload shape Meta's Cloud API delivers.",
      bn: "Meta Cloud API যে আকারে পাঠায়, সেই আকারে /api/intake/whatsapp-এ পাঠানো হয়।",
    },
    sms: {
      en: "Posted to /api/intake/sms the way an SMS aggregator would.",
      bn: "SMS অ্যাগ্রিগেটর যেভাবে পাঠায়, সেভাবে /api/intake/sms-এ পাঠানো হয়।",
    },
  },
};

const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Sends one message through the real webhook for the chosen channel. */
async function deliver(channel: Channel, from: string, text: string): Promise<{ reply: string; code?: string }> {
  if (channel === "whatsapp") {
    const res = await fetch("/api/intake/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { messaging_product: "whatsapp", messages: [
          { from: `880${from.slice(1)}`, id: `wamid.demo.${Date.now()}`, type: "text", text: { body: text } },
        ] } }] }],
      }),
    });
    const body = await res.json();
    const first = body.handled?.[0];
    if (!first) throw new Error("No reply");
    return { reply: first.reply, code: first.complaintCode };
  }
  const res = await fetch("/api/intake/sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, text, channel: "sms" }),
  });
  const body = await res.json();
  if (!body.reply) throw new Error(body.error ?? "No reply");
  return { reply: body.reply, code: body.complaintCode };
}

export default function Phone() {
  const { t, lang } = useI18n();
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [from, setFrom] = useState(RESIDENTS[0].phone);
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy]);

  const resident = RESIDENTS.find(r => r.phone === from);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || busy) return;
    setDraft("");
    setThread(prev => [...prev, { id: ++seq.current, who: "citizen", text: body, at: new Date() }]);
    setBusy(true);
    try {
      const { reply, code } = await deliver(channel, from, body);
      if (code) setLastCode(code);
      setThread(prev => [...prev, { id: ++seq.current, who: "system", text: reply, at: new Date(), code }]);
    } catch {
      setThread(prev => [...prev, { id: ++seq.current, who: "system", text: COPY.offline[lang], at: new Date(), failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  // Once a report exists, the STATUS suggestion points at it rather than a seed code.
  const suggestions = COPY.how.map(h => (h.cmd.startsWith("STATUS") && lastCode ? `STATUS ${lastCode}` : h.cmd));

  return (
    <div className="public-site is-ready phone-page">
      <header className="public-nav">
        <LiveBrandLockup size={34} className="public-brand" />
        <div className="public-nav-actions">
          <LanguageToggle compact />
          <Link href="/" className="back-link">
            <ArrowLeft size={15} /> {t("common.back")}
          </Link>
        </div>
      </header>

      <main className="phone-layout">
        <section className="phone-intro">
          <p className="public-kicker">{COPY.kicker[lang]}</p>
          <h1>{COPY.title[lang]}</h1>
          <p className="about-lead">{COPY.lead[lang]}</p>

          <h3>{COPY.howTitle[lang]}</h3>
          <ul className="phone-commands">
            {COPY.how.map((h, i) => (
              <li key={h.cmd}>
                <button type="button" onClick={() => send(suggestions[i])} disabled={busy}>
                  <code>{suggestions[i]}</code>
                </button>
                <span>{h[lang]}</span>
              </li>
            ))}
          </ul>

          <h3>{COPY.thenTitle[lang]}</h3>
          <p className="phone-then">{COPY.then[lang]}</p>
          <a className="public-primary" href="/login" target="_blank" rel="noreferrer">
            {COPY.openDashboard[lang]} <ArrowUpRight size={15} />
          </a>
        </section>

        <section className="phone-stage">
          <div className="phone-controls">
            <div className="phone-channels" role="tablist">
              <button role="tab" aria-selected={channel === "whatsapp"} className={channel === "whatsapp" ? "active" : ""} onClick={() => setChannel("whatsapp")}>
                <MessageSquareText size={15} /> WhatsApp
              </button>
              <button role="tab" aria-selected={channel === "sms"} className={channel === "sms" ? "active" : ""} onClick={() => setChannel("sms")}>
                <PhoneIcon size={15} /> SMS
              </button>
            </div>
            <label className="phone-from">
              <span>{COPY.from[lang]}</span>
              <input
                value={from}
                onChange={e => setFrom(e.target.value.replace(/\D/g, "").slice(0, 11))}
                inputMode="numeric"
                list="phone-residents"
                spellCheck={false}
              />
              <datalist id="phone-residents">
                {RESIDENTS.map(r => (
                  <option key={r.phone} value={r.phone}>{r.name} — {r.ward}</option>
                ))}
              </datalist>
              <small>{resident ? `${resident.name} · ${resident.ward}` : COPY.numberHint[lang]}</small>
            </label>
          </div>

          <div className={`phone-device ${channel}`}>
            <div className="phone-status">
              <span>{time(new Date())}</span>
              <span><Signal size={12} /> <Wifi size={12} /> ▮▮▮</span>
            </div>
            <div className="phone-header">
              <div className="phone-avatar">{channel === "whatsapp" ? "DCC" : "ST"}</div>
              <div>
                <strong>{channel === "whatsapp" ? COPY.whatsappName[lang] : COPY.smsName[lang]}</strong>
                <small>{channel === "whatsapp" ? "Business account" : "SMS"}</small>
              </div>
            </div>
            <div className="phone-thread" ref={scroller}>
              {thread.length === 0 && <p className="phone-empty">{COPY.empty[lang]}</p>}
              {thread.map(b => (
                <div key={b.id} className={`phone-bubble ${b.who} ${b.failed ? "failed" : ""}`}>
                  <p>{b.text}</p>
                  {b.code && (
                    <a href={`/login`} target="_blank" rel="noreferrer" className="phone-filed">
                      {COPY.filed[lang]} <b>{b.code}</b> <ArrowUpRight size={12} />
                    </a>
                  )}
                  <time>{time(b.at)}</time>
                </div>
              ))}
              {busy && (
                <div className="phone-bubble system typing"><span /><span /><span /></div>
              )}
            </div>
            <form
              className="phone-compose"
              onSubmit={e => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={COPY.placeholder[lang]}
                maxLength={320}
              />
              <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
                <SendHorizontal size={17} />
              </button>
            </form>
          </div>
          <p className="phone-note">{COPY.channelNote[channel][lang]}</p>
        </section>
      </main>
    </div>
  );
}
