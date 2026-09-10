/**
 * A citizen's own reports and where each one stands.
 *
 * Reachable two ways. A signed-in citizen sees their reports directly; anyone
 * else can type the phone number they filed from and get the same view. That
 * second path is the important one — a resident who reported by SMS never had
 * an account, and requiring them to make one just to read the answer would
 * undo the reason the SMS channel exists.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, FileText, LogOut } from "lucide-react";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
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

/** The tracked shape carries its trail inline; the signed-in one fetches it. */
interface TrackedRow extends Row {
  binLandmark: string | null;
  history: HistoryStep[];
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

  /* Phone lookup, for the visitor who never signed in. `searched` separates
     "nothing typed yet" from "typed a number and it has no reports", which are
     very different things to show. */
  const [phone, setPhone] = useState("");
  const [looking, setLooking] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedRow[]>([]);

  useEffect(() => {
    if (!user) return;
    api
      .get<{ complaints: Row[] }>("/complaints")
      .then(r => setRows(r.complaints))
      .catch(() => setRows([]));
  }, [user]);

  const lookUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLooking(true);
    setLookupError(null);
    try {
      const r = await api.post<{ complaints: TrackedRow[] }>("/complaints/track", { phone });
      setTracked(r.complaints);
      setSearched(true);
    } catch {
      setLookupError(t("track.badNumber"));
    } finally {
      setLooking(false);
    }
  };

  /** Whichever set this visitor is entitled to see. */
  const visible: Row[] = user ? rows : tracked;

  const toggle = async (row: Row) => {
    if (openId === row.complaintId) {
      setOpenId(null);
      return;
    }
    // A tracked report already carries its trail, and `/complaints/:id` needs
    // a session this visitor does not have.
    if (!user) {
      setHistory(tracked.find(x => x.complaintId === row.complaintId)?.history ?? []);
      setOpenId(row.complaintId);
      return;
    }
    setOpenId(row.complaintId);
    const res = await api.get<{ history: HistoryStep[] }>(`/complaints/${row.complaintId}`);
    setHistory(res.history);
  };

  return (
    <div className="report-page">
      <header className="report-nav">
        <LiveBrandLockup size={34} className="public-brand" tagline={user?.fullName ?? false} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LanguageToggle />
          <Link href="/report" className="public-nav-cta">
            {t("nav.report")} <ArrowRight size={15} />
          </Link>
          {user && (
            <button
              className="back-link"
              onClick={() => void logout()}
              style={{ background: "transparent", cursor: "pointer" }}
            >
              <LogOut size={15} /> {t("common.signOut")}
            </button>
          )}
        </div>
      </header>

      <main className="report-track">
        <p className="public-kicker">{t("report.kicker")}</p>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 36,
            letterSpacing: "-.025em",
            margin: "8px 0 8px",
          }}
        >
          {t("myReports.title")}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 16.5, margin: "0 0 30px", lineHeight: 1.6 }}>
          {user ? t("myReports.sub") : t("track.sub")}
        </p>

        {/* No account? The number you texted from is the key. */}
        {!user && (
          <form className="track-form" onSubmit={lookUp}>
            <label htmlFor="track-phone">{t("track.label")}</label>
            <div className="track-row">
              <input
                id="track-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01712345678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
              <button type="submit" className="public-primary" disabled={looking}>
                {looking ? t("common.loading") : t("track.submit")}
                {!looking && <ArrowRight size={15} />}
              </button>
            </div>
            {lookupError && <p className="track-error">{lookupError}</p>}
            <p className="track-hint">{t("track.hint")}</p>
          </form>
        )}

        {visible.length === 0 && (user || searched) && (
          <div className="panel-card">
            <div className="empty-state">
              <FileText size={30} />
              <p>{user ? t("myReports.empty") : t("track.noneFound")}</p>
              <Link href="/report" className="public-primary" style={{ marginTop: 16 }}>
                {t("nav.report")} <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {visible.map(r => (
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
                  <strong style={{ display: "block", fontSize: 16, marginBottom: 3 }}>
                    {COMPLAINT_TYPE_LABELS[r.complaintType][lang]}
                  </strong>
                  <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
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
