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
import { dateTime, relativeTime, titleCase } from "@/lib/format";
import { COMPLAINT_TRANSITIONS, type ComplaintStatus } from "@shared/types";

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
    <AppShell title="Citizen complaints" eyebrow="ACCOUNTABILITY DESK">
      <div className="filter-row">
        <div className="chip-row">
          {["", "pending", "assigned", "in_progress", "resolved"].map(s => (
            <button key={s} className={`chip ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
              {s === "" ? "All" : titleCase(s)}
            </button>
          ))}
        </div>
      </div>

      <section className="dashboard-grid">
        <div className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">QUEUE</p>
              <h3>{rows.length} complaints</h3>
            </div>
          </div>
          <div className="complaints-list" style={{ maxHeight: 620, overflowY: "auto" }}>
            {rows.length === 0 && (
              <div className="empty-state">
                <MessageSquare size={30} />
                <p>No complaints match this filter.</p>
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
                  <strong>{r.locationText ?? titleCase(r.complaintType)}</strong>
                  <span>
                    {r.complaintCode} · {r.citizenName} · {relativeTime(r.createdAt)} ·{" "}
                    <span className={`channel-tag ${r.channel === "web" ? "web" : ""}`}>
                      {r.channel}
                    </span>
                  </span>
                </div>
                <span className={`status-pill ${TONE[r.status]}`}>{titleCase(r.status)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="side-column">
          {!selected ? (
            <div className="panel-card">
              <div className="empty-state">
                <MessageSquare size={30} />
                <p>Select a complaint to see its full audit trail.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-card padded">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">{selected.complaintCode}</p>
                    <h3>{titleCase(selected.complaintType)}</h3>
                  </div>
                  <span className={`status-pill ${TONE[selected.status]}`}>
                    {titleCase(selected.status)}
                  </span>
                </div>

                <div className="impact-rows" style={{ marginBottom: 14 }}>
                  <div>
                    <span>Reported by</span>
                    <b>{selected.citizenName}</b>
                  </div>
                  <div>
                    <span>Location</span>
                    <b>{selected.locationText ?? "—"}</b>
                  </div>
                  <div>
                    <span>Bin</span>
                    <b>{selected.binCode ?? "Ward-level"}</b>
                  </div>
                  <div>
                    <span>Channel</span>
                    <b>{selected.channel.toUpperCase()}</b>
                  </div>
                  <div>
                    <span>Priority</span>
                    <b>{titleCase(selected.priority)}</b>
                  </div>
                </div>

                {selected.description && (
                  <p
                    style={{
                      fontSize: 13.5,
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
                      <span>Remark for the audit trail</span>
                      <input
                        value={remark}
                        onChange={e => setRemark(e.target.value)}
                        placeholder="What did you do?"
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
                          Mark {titleCase(next)}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {allowed.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                    This complaint is closed. The trail below is permanent.
                  </p>
                )}
              </div>

              <div className="panel-card padded">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">AUDIT TRAIL</p>
                    <h3>Append-only history</h3>
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
                        <strong>{titleCase(h.newStatus)}</strong>
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
