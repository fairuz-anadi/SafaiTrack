/**
 * Complaint desk for municipal staff and ward officers.
 *
 * Selecting a complaint opens its append-only status history — every
 * transition, who made it and when. Nothing is ever overwritten, which is the
 * accountability guarantee the informal phone-call channel cannot offer.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type StringKey } from "@/lib/i18n";
import { dateTime, relativeTime, titleCase } from "@/lib/format";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_TRANSITIONS,
  COMPLAINT_TYPE_LABELS,
  type ComplaintStatus,
  type ComplaintType,
} from "@shared/types";

interface Row {
  complaintId: number;
  complaintCode: string;
  complaintType: string;
  description: string | null;
  status: ComplaintStatus;
  priority: string;
  channel: string;
  locationText: string | null;
  createdAt: string;
  resolvedAt: string | null;
  binCode: string | null;
  wardName: string | null;
  citizenName: string;
}

interface HistoryStep {
  changeNo: number;
  oldStatus: string | null;
  newStatus: string;
  changedAt: string;
  remark: string | null;
  changedByName: string | null;
  changedByRole: string | null;
}

const TONE: Record<string, string> = {
  pending: "blue",
  assigned: "amber",
  in_progress: "amber",
  resolved: "green",
  rejected: "coral",
};

export default function Complaints() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api.get<{ complaints: Row[] }>(
      `/complaints${filter ? `?status=${filter}` : ""}`
    );
    setRows(res.complaints);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (row: Row) => {
    setSelected(row);
    setRemark("");
    setError("");
    const res = await api.get<{ history: HistoryStep[] }>(`/complaints/${row.complaintId}`);
    setHistory(res.history);
  };

  const transition = async (status: ComplaintStatus) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.patch(`/complaints/${selected.complaintId}/status`, { status, remark });
      await load();
      const refreshed = await api.get<{ complaint: Row; history: HistoryStep[] }>(
        `/complaints/${selected.complaintId}`
      );
      setHistory(refreshed.history);
      setSelected(s => (s ? { ...s, status } : s));
      setRemark("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the complaint");
    } finally {
      setBusy(false);
    }
  };

  const canAct = user?.role === "officer" || user?.role === "staff";
  const allowed = selected ? COMPLAINT_TRANSITIONS[selected.status] : [];

  return (
    <AppShell title={t("comp.title")} eyebrow={t("comp.eyebrow")}>
      <div className="filter-row">
        <div className="chip-row">
          {["", "pending", "assigned", "in_progress", "resolved"].map(s => (
            <button key={s} className={`chip ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
              {s === "" ? t("common.all") : COMPLAINT_STATUS_LABELS[s as ComplaintStatus][lang]}
            </button>
          ))}
        </div>
      </div>

      <section className="dashboard-grid">
        <div className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("comp.queue")}</p>
              <h3>
                {rows.length} {t("comp.count")}
              </h3>
            </div>
          </div>
          <div className="complaints-list" style={{ maxHeight: 620, overflowY: "auto" }}>
            {rows.length === 0 && (
              <div className="empty-state">
                <MessageSquare size={30} />
                <p>{t("comp.noMatch")}</p>
              </div>
            )}
            {rows.map(r => (
              <div
                className="complaint-row"
                key={r.complaintId}
                onClick={() => void open(r)}
                style={{
                  cursor: "pointer",
                  background: selected?.complaintId === r.complaintId ? "rgba(183,239,93,.11)" : undefined,
                }}
              >
                <div className={`complaint-icon ${r.priority === "urgent" ? "coral" : TONE[r.status]}`}>
                  <AlertCircle size={16} />
                </div>
                <div className="complaint-info">
                  <strong>{r.locationText ?? COMPLAINT_TYPE_LABELS[r.complaintType as ComplaintType][lang]}</strong>
                  <span>
                    {r.complaintCode} · {r.citizenName} · {relativeTime(r.createdAt)} ·{" "}
                    <span className={`channel-tag ${r.channel === "web" ? "web" : ""}`}>
                      {r.channel}
                    </span>
                  </span>
                </div>
                <span className={`status-pill ${TONE[r.status]}`}>
                  {COMPLAINT_STATUS_LABELS[r.status][lang]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="side-column">
          {!selected ? (
            <div className="panel-card">
              <div className="empty-state">
                <MessageSquare size={30} />
                <p>{t("comp.selectOne")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-card padded">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">{selected.complaintCode}</p>
                    <h3>{COMPLAINT_TYPE_LABELS[selected.complaintType as ComplaintType][lang]}</h3>
                  </div>
                  <span className={`status-pill ${TONE[selected.status]}`}>
                    {COMPLAINT_STATUS_LABELS[selected.status][lang]}
                  </span>
                </div>

                <div className="impact-rows" style={{ marginBottom: 14 }}>
                  <div>
                    <span>{t("comp.reportedBy")}</span>
                    <b>{selected.citizenName}</b>
                  </div>
                  <div>
                    <span>{t("common.location")}</span>
                    <b>{selected.locationText ?? "—"}</b>
                  </div>
                  <div>
                    <span>{t("comp.bin")}</span>
                    <b>{selected.binCode ?? t("comp.wardLevel")}</b>
                  </div>
                  <div>
                    <span>{t("common.channel")}</span>
                    <b>{selected.channel.toUpperCase()}</b>
                  </div>
                  <div>
                    <span>{t("common.priority")}</span>
                    <b>{titleCase(selected.priority)}</b>
                  </div>
                </div>

                {selected.description && (
                  <p
                    style={{
                      fontSize: 15.5,
                      lineHeight: 1.65,
                      color: "var(--muted)",
                      background: "var(--paper)",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      margin: "0 0 14px",
                    }}
                  >
                    “{selected.description}”
                  </p>
                )}

                {error && <div className="auth-error">{error}</div>}

                {canAct && allowed.length > 0 && (
                  <>
                    <label className="auth-field">
                      <span>{t("comp.remark")}</span>
                      <input
                        value={remark}
                        onChange={e => setRemark(e.target.value)}
                        placeholder={t("comp.remarkPlaceholder")}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {allowed.map(next => (
                        <button
                          key={next}
                          className={next === "resolved" ? "primary-button" : "outline-button"}
                          disabled={busy}
                          onClick={() => void transition(next)}
                        >
                          {busy ? <span className="spinner" /> : next === "resolved" && <Check size={15} />}
                          {t("comp.markAs")} {COMPLAINT_STATUS_LABELS[next][lang]}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {allowed.length === 0 && (
                  <p style={{ fontSize: 15, color: "var(--muted)", margin: 0 }}>
                    {t("comp.closed")}
                  </p>
                )}
              </div>

              <div className="panel-card padded">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">{t("comp.auditTrail")}</p>
                    <h3>{t("comp.appendOnly")}</h3>
                  </div>
                </div>
                <div className="audit-trail">
                  {history.map((h, i) => (
                    <div
                      className={`audit-step ${i === history.length - 1 ? "current" : ""}`}
                      key={h.changeNo}
                    >
                      <div className="audit-dot" />
                      <div className="audit-body">
                        <strong>
                          {COMPLAINT_STATUS_LABELS[h.newStatus as ComplaintStatus]?.[lang] ??
                            titleCase(h.newStatus)}
                        </strong>
                        <span>
                          {dateTime(h.changedAt)}
                          {h.changedByName && ` · ${h.changedByName}`}
                          {h.changedByRole && ` (${h.changedByRole})`}
                        </span>
                        {h.remark && <p>{h.remark}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <AgentPanel />
    </AppShell>
  );
}
