/** A citizen's own reports and where each one stands. */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, FileText, Leaf, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { dateTime, relativeTime, titleCase } from "@/lib/format";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_TYPE_LABELS, type ComplaintStatus, type ComplaintType } from "@shared/types";

interface Row {
  complaintId: number;
  complaintCode: string;
  complaintType: ComplaintType;
  status: ComplaintStatus;
  channel: string;
  locationText: string | null;
  createdAt: string;
  resolvedAt: string | null;
  binCode: string | null;
}

interface HistoryStep {
  changeNo: number;
  newStatus: string;
  changedAt: string;
  remark: string | null;
  changedByName: string | null;
}

const TONE: Record<string, string> = {
  pending: "blue",
  assigned: "amber",
  in_progress: "amber",
  resolved: "green",
  rejected: "coral",
};

export default function MyReports() {
  const { user, logout } = useAuth();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryStep[]>([]);

  useEffect(() => {
    api
      .get<{ complaints: Row[] }>("/complaints")
      .then(r => setRows(r.complaints))
      .catch(() => setRows([]));
  }, []);

  const toggle = async (row: Row) => {
    if (openId === row.complaintId) {
      setOpenId(null);
      return;
    }
    setOpenId(row.complaintId);
    const res = await api.get<{ history: HistoryStep[] }>(`/complaints/${row.complaintId}`);
    setHistory(res.history);
  };

  return (
    <div className="report-page">
      <header className="report-nav">
        <Link href="/" className="public-brand">
          <span className="public-brand-mark">
            <Leaf size={17} fill="currentColor" />
          </span>
          <span>
            <b>
              Safai<span>Track</span>
            </b>
            <small>{user?.fullName}</small>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LanguageToggle />
          <Link href="/report" className="public-nav-cta">
            {t("nav.report")} <ArrowRight size={15} />
          </Link>
          <button
            className="back-link"
            onClick={() => void logout()}
            style={{ background: "transparent", cursor: "pointer" }}
          >
            <LogOut size={15} /> {t("common.signOut")}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "40px 24px 70px" }}>
        <p className="public-kicker">{t("report.kicker")}</p>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 34,
            letterSpacing: "-.025em",
            margin: "8px 0 8px",
          }}
        >
          {t("myReports.title")}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 30px", lineHeight: 1.6 }}>
          {t("myReports.sub")}
        </p>

        {rows.length === 0 && (
          <div className="panel-card">
            <div className="empty-state">
              <FileText size={30} />
              <p>{t("myReports.empty")}</p>
              <Link href="/report" className="public-primary" style={{ marginTop: 16 }}>
                {t("nav.report")} <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {rows.map(r => (
            <div className="panel-card" key={r.complaintId} style={{ padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => void toggle(r)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "18px 20px",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div className={`complaint-icon ${TONE[r.status]}`}>
                  {r.status === "resolved" ? <Check size={16} /> : <FileText size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 14.5, marginBottom: 3 }}>
                    {COMPLAINT_TYPE_LABELS[r.complaintType][lang]}
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {r.complaintCode} · {r.locationText ?? r.binCode} · {relativeTime(r.createdAt)}
                  </span>
                </div>
                <span className={`status-pill ${TONE[r.status]}`}>
                  {COMPLAINT_STATUS_LABELS[r.status][lang]}
                </span>
              </button>

              {openId === r.complaintId && (
                <div style={{ padding: "4px 20px 22px", borderTop: "1px solid var(--line)" }}>
                  <p className="section-kicker" style={{ margin: "16px 0 14px" }}>
                    {t("myReports.progress")}
                  </p>
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
                          </span>
                          {h.remark && <p>{h.remark}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
