/**
 * The single SafaiTrack assistant.
 *
 * It answers general operations questions, and on pages that offer explainable elements it can
 * be put into Explainer Mode: the reader clicks a number and asks about that number. Both modes
 * end at the same bounded, grounded backend — nothing here decides anything operational.
 */
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, type StringKey } from "@/lib/i18n";
import type { BriefingResponse } from "@shared/briefings";
import { useExplainer, type ExplainerSelection } from "./ExplainerMode";

interface Turn {
  role: "user" | "assistant";
  text?: string;
  source?: "claude" | "openai" | "offline";
  tools?: { name: string }[];
  /** Present when the answer came from the bounded explainer rather than the general assistant. */
  briefing?: BriefingResponse;
}

const SUGGESTION_KEYS: StringKey[] = ["agent.q1", "agent.q2", "agent.q3", "agent.q4"];

export function AgentPanel() {
  const { t, lang } = useI18n();
  const explainer = useExplainer();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [engine, setEngine] = useState<{ claudeConfigured: boolean; model: string } | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const explaining = explainer?.active ?? false;
  const selection = explainer?.selection ?? null;
  const selectionKey = JSON.stringify(selection?.focus ?? null);

  useEffect(() => {
    if (!open || engine) return;
    api
      .get<{ claudeConfigured: boolean; model: string }>("/agent/status")
      .then(setEngine)
      .catch(() => setEngine({ claudeConfigured: false, model: "offline" }));
  }, [open, engine]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // Selecting a card brings the assistant forward.
  useEffect(() => {
    if (explainer?.openSignal) setOpen(true);
  }, [explainer?.openSignal]);

  /**
   * Establishes context for a newly selected element. This asks the server for its verified
   * reading and its contextual questions — no generation runs, so it stays instant and free.
   */
  useEffect(() => {
    if (!explaining) return;
    let stale = false;
    setTurns([]);
    setChips([]);
    setInput("");
    const body = {
      scope: { kind: "current_dashboard" as const },
      focus: selection?.focus ?? { type: "dashboard" as const },
      language: lang,
      question: "",
      mode: "deterministic" as const,
    };
    api
      .post<BriefingResponse>("/agent/dashboard-briefing", body)
      .then(reply => {
        if (stale) return;
        setChips(reply.suggestedQuestions.slice(0, 3));
        if (selection) setTurns([{ role: "assistant", briefing: reply, source: "offline" }]);
      })
      .catch(() => {
        if (!stale) setChips([]);
      });
    return () => {
      stale = true;
    };
    // A different element is a different subject: never let the previous answer stand as its context.
  }, [explaining, selectionKey, lang]);

  const askExplainer = async (message: string, current: ExplainerSelection | null) => {
    const reply = await api.post<BriefingResponse>("/agent/dashboard-briefing", {
      scope: { kind: "current_dashboard" as const },
      focus: current?.focus ?? { type: "dashboard" as const },
      language: lang,
      question: message,
      mode: "auto" as const,
    });
    setChips(reply.suggestedQuestions.slice(0, 3));
    return { role: "assistant" as const, briefing: reply, source: reply.source !== "deterministic" ? reply.source : ("offline" as const) };
  };

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    setInput("");
    setTurns(previous => [...previous, { role: "user", text: message }]);
    setBusy(true);
    try {
      if (explaining) {
        const answer = await askExplainer(message, selection);
        setTurns(previous => [...previous, answer]);
      } else {
        const res = await api.post<{
          conversationId: number;
          reply: string;
          source: "claude" | "openai" | "offline";
          toolCalls: { name: string }[];
        }>("/agent/ask", { message, conversationId });
        setConversationId(res.conversationId);
        setTurns(previous => [...previous, { role: "assistant", text: res.reply, source: res.source, tools: res.toolCalls }]);
      }
    } catch (err) {
      setTurns(previous => [
        ...previous,
        { role: "assistant", text: err instanceof Error ? err.message : t("agent.unavailable"), source: "offline" },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="agent-launch" onClick={() => setOpen(true)}>
        <Sparkles size={17} fill="currentColor" /> {t("agent.launch")}
      </button>
    );
  }

  const lastSource = [...turns].reverse().find(turn => turn.role === "assistant")?.source;
  const live = lastSource ? (lastSource === "claude" || lastSource === "openai") : false;

  return (
    <aside
      className="agent-drawer"
      role="dialog"
      aria-label={t("agent.title")}
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        if (selection) explainer?.clear();
        else if (explaining) explainer?.exit();
        else setOpen(false);
      }}
    >
      <div className="agent-head">
        <div className="agent-mark">
          <Bot size={19} />
        </div>
        <div>
          <strong>{t("agent.title")}</strong>
          <small>
            <span className={`agent-engine ${live ? "live" : "offline"}`}>
              {live ? engine?.model : t("agent.offline")}
            </span>
          </small>
        </div>
        <button className="agent-close" onClick={() => setOpen(false)} aria-label={t("common.close")}>
          <X size={18} />
        </button>
      </div>

      {explainer && (
        <div className="explainer-bar">
          <span className="explainer-bar-label">{t("explainer.mode")}</span>
          <button
            type="button"
            className={`explainer-switch${explaining ? " is-on" : ""}`}
            role="switch"
            aria-checked={explaining}
            onClick={() => (explaining ? explainer.exit() : explainer.enter())}
          >
            <span aria-hidden="true" />
            {explaining ? t("explainer.on") : t("explainer.off")}
          </button>
        </div>
      )}

      {explaining && selection && (
        <div className="explainer-chip-row">
          <span className="explainer-chip">
            <em>{t("explainer.explaining")}</em>
            {selection.label} · {selection.value}
            <button type="button" onClick={() => explainer?.clear()} aria-label={t("explainer.clear")}>
              <X size={13} />
            </button>
          </span>
        </div>
      )}

      <div className="agent-body" ref={bodyRef}>
        {explaining && !selection && turns.length === 0 && (
          <p className="agent-empty">{explainer?.hintSeen ? t("explainer.pickAnother") : t("explainer.hint")}</p>
        )}

        {!explaining && turns.length === 0 && (
          <>
            <p className="agent-empty">{t("agent.intro")}</p>
            <div className="agent-suggestions">
              {SUGGESTION_KEYS.map(key => (
                <button key={key} onClick={() => void send(t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </>
        )}

        {turns.map((turn, index) =>
          turn.briefing ? (
            <BriefingTurn key={index} briefing={turn.briefing} />
          ) : (
            <div key={index} className={`agent-msg ${turn.role}`}>
              {turn.text}
              {turn.role === "assistant" && turn.tools && turn.tools.length > 0 && (
                <div className="agent-tools">
                  {turn.tools.map((tool, k) => (
                    <span key={`${tool.name}-${k}`}>{tool.name}</span>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="agent-msg assistant agent-thinking">
            <span className="spinner" /> {explaining ? (selection ? t("explainer.reading") : t("explainer.readingBoard")) : t("agent.reading")}
          </div>
        )}
      </div>

      {explaining && chips.length > 0 && !busy && (
        <div className="explainer-suggestions">
          {chips.map(chip => (
            <button type="button" key={chip} onClick={() => void send(chip)}>
              {chip}
            </button>
          ))}
        </div>
      )}

      <form
        className="agent-foot"
        onSubmit={event => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={explaining ? (selection ? t("explainer.askMetric") : t("explainer.askBoard")) : t("agent.placeholder")}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}

/** A grounded answer, rendered as an answer rather than as a report. */
function BriefingTurn({ briefing }: { briefing: BriefingResponse }) {
  return (
    <div className="agent-msg assistant briefing-turn">
      <strong>{briefing.headline}</strong>
      <p>{briefing.summary}</p>
      {briefing.sections.map(section => (
        <p key={section.label} className="briefing-turn-section">
          <em>{section.heading}</em>
          {section.text}
        </p>
      ))}
      {briefing.cannotAnswer.map(text => (
        <p key={text} className="briefing-turn-limit">
          {text}
        </p>
      ))}
      {briefing.notes.slice(0, 1).map(note => (
        <p key={note} className="briefing-turn-note">
          {note}
        </p>
      ))}
    </div>
  );
}
