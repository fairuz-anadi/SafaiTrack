import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { BriefingResponse, RecommendedView } from "@shared/briefings";

/**
 * The reader-facing half of the explainers. Everything the server sends for logging —
 * evidence IDs, snapshot hashes, model names, fallback reasons — deliberately stays out of the
 * markup: if the deterministic writer answered, that answer simply is the explanation.
 */
export function BriefingPanel({ feature, target, revision = "", initial = false }: {
  feature: "route" | "dashboard";
  target: Record<string, unknown>;
  revision?: string;
  initial?: boolean;
}) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const [reply, setReply] = useState<BriefingResponse | null>(null);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(initial);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const targetKey = JSON.stringify(target);

  const title = feature === "route"
    ? bn ? "এই রুটটি কেন" : "Why this route"
    : bn ? "এই সংখ্যাগুলোর অর্থ" : "What these numbers mean";
  const waiting = feature === "route"
    ? bn ? "রুটটি দেখা হচ্ছে…" : "Looking at this route…"
    : bn ? "ড্যাশবোর্ডটি দেখা হচ্ছে…" : "Understanding the current dashboard…";
  const destinations: Record<RecommendedView, { href: string; label: string }> = {
    critical_bins: { href: "/bins?band=critical", label: bn ? "সংকটাপন্ন বিন দেখুন" : "Inspect critical bins" },
    forecasts: { href: "/bins", label: bn ? "আউটলুক দেখুন" : "Inspect the outlook" },
    complaints: { href: "/complaints", label: bn ? "অভিযোগ দেখুন" : "Review complaints" },
    routes: { href: "/routes", label: bn ? "রুট দেখুন" : "Inspect routes" },
  };

  const load = async (mode: "auto" | "deterministic", text = "") => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = ++version.current;
    setBusy(true);
    setError("");
    setOpen(true);
    setAsked(text);
    // Bound the browser wait too, in case the API process itself is unreachable.
    const timeout = window.setTimeout(() => abort.abort(), 25_000);
    try {
      const scope = JSON.parse(targetKey);
      const body = feature === "route"
        ? { target: scope, language: lang, question: text, mode }
        : { scope, language: lang, question: text, mode };
      const result = await api.post<BriefingResponse>(`/agent/${feature}-briefing`, body, { signal: abort.signal });
      if (current === version.current) setReply(result);
    } catch (caught) {
      if (current === version.current) {
        setError(abort.signal.aborted
          ? bn ? "উত্তর তৈরি করতে বেশি সময় লাগছে। আবার চেষ্টা করুন।" : "That took too long to put together. Try again."
          : caught instanceof Error ? caught.message : bn ? "এখন ব্যাখ্যা তৈরি করা গেল না।" : "I could not put together an explanation right now.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (current === version.current) setBusy(false);
    }
  };

  useEffect(() => {
    controller.current?.abort();
    version.current++;
    setReply(null);
    setError("");
    setBusy(false);
    setQuestion("");
    setAsked("");
    if (initial) void load("deterministic");
    return () => { version.current++; controller.current?.abort(); };
    // Changed inputs invalidate the old answer. Rendering never triggers a paid call.
  }, [targetKey, lang, revision, initial]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setQuestion("");
    void load("auto", trimmed);
  };

  return (
    <section className="panel-card padded briefing" aria-label={title}>
      <div className="briefing-head">
        <h3><span aria-hidden="true" className="briefing-mark">✦</span>{title}</h3>
        {!open && (
          <button type="button" className="outline-button" onClick={() => void load("deterministic")}>
            {feature === "route" ? (bn ? "রুটটি ব্যাখ্যা করুন" : "Explain this route") : (bn ? "ব্যাখ্যা দেখুন" : "Show explanation")}
          </button>
        )}
      </div>

      {open && (
        <>
          <div aria-live="polite" aria-busy={busy}>
            {asked && <p className="briefing-asked">{asked}</p>}

            {busy && <p className="briefing-waiting"><span className="spinner" />{waiting}</p>}

            {error && !reply && <p role="alert" className="briefing-waiting">{error}</p>}

            {reply && !busy && (
              <>
                <p className="briefing-headline">{reply.headline}</p>
                <p className="briefing-summary">{reply.summary}</p>

                {reply.highlights.length > 0 && (
                  <div className="briefing-highlights">
                    {reply.highlights.map(highlight => (
                      <div key={highlight.label}>
                        <strong>{highlight.value}</strong>
                        <span>{highlight.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {reply.sections.map(section => (
                  <div className="briefing-section" key={section.label}>
                    <h4>{section.heading}</h4>
                    <p>{section.text}</p>
                  </div>
                ))}

                {reply.cannotAnswer.map(text => <p className="briefing-limit" key={text}>{text}</p>)}

                {reply.notes.length > 0 && (
                  <div className="briefing-note">
                    <h4>{bn ? "মনে রাখবেন" : "Worth knowing"}</h4>
                    {reply.notes.map(note => <p key={note}>{note}</p>)}
                  </div>
                )}

                {reply.recommendedViews.length > 0 && (
                  <div className="chip-row briefing-links">
                    {reply.recommendedViews.map(view => (
                      <Link key={view} href={destinations[view].href} className="text-button">{destinations[view].label}</Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {reply && (
            <div className="briefing-ask">
              <div className="chip-row">
                {reply.suggestedQuestions.slice(0, 4).map(suggestion => (
                  <button type="button" key={suggestion} className="briefing-chip" disabled={busy} onClick={() => submit(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
              <form onSubmit={event => { event.preventDefault(); submit(question); }}>
                <input
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  maxLength={1000}
                  disabled={busy}
                  aria-label={feature === "route" ? (bn ? "এই রুট নিয়ে প্রশ্ন করুন" : "Ask about this route") : (bn ? "এই ড্যাশবোর্ড নিয়ে প্রশ্ন করুন" : "Ask about this dashboard")}
                  placeholder={feature === "route" ? (bn ? "এই রুট নিয়ে প্রশ্ন করুন" : "Ask about this route") : (bn ? "এই ড্যাশবোর্ড নিয়ে প্রশ্ন করুন" : "Ask about this dashboard")}
                />
                <button type="submit" className="outline-button" disabled={busy || !question.trim()}>{bn ? "জিজ্ঞাসা করুন" : "Ask"}</button>
              </form>
            </div>
          )}

          {reply && (
            <div className="briefing-foot">
              <span>{bn ? "SafaiTrack-এর বর্তমান তথ্য থেকে তৈরি" : "Generated from current SafaiTrack data"}</span>
              <details>
                <summary>{bn ? "এটি কীভাবে হিসাব করা হয়?" : "How is this calculated?"}</summary>
                <ul>{reply.methodNotes.map(note => <li key={note}>{note}</li>)}</ul>
              </details>
            </div>
          )}
        </>
      )}
    </section>
  );
}
