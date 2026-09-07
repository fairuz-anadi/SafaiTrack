/**
 * Citizen reporting portal — fully bilingual, and honest about the low-tech
 * alternative for residents who do not use a smartphone.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Check, MapPin, MessageSquare, ShieldCheck } from "lucide-react";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { COMPLAINT_TYPE_LABELS, COMPLAINT_TYPES, type ComplaintType } from "@shared/types";

interface BinOption {
  binId: number;
  binCode: string;
  landmark: string;
  landmarkBn: string | null;
  wardName: string;
  currentFillPercent: number;
}

export default function Report() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [bins, setBins] = useState<BinOption[]>([]);
  const [issue, setIssue] = useState<ComplaintType>("overflow");
  const [binId, setBinId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ bins: BinOption[] }>("/bins")
      .then(r => {
        setBins(r.bins);
        setBinId(prev => prev ?? r.bins[0]?.binId ?? null);
      })
      .catch(() => setBins([]));
  }, []);

  const selectedBin = useMemo(() => bins.find(b => b.binId === binId) ?? null, [bins, binId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!binId) {
      setError(t("report.chooseBin"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ complaint: { complaintCode: string } }>("/complaints", {
        complaintType: issue,
        binId,
        description: description || undefined,
        channel: "web",
      });
      setSubmitted(res.complaint.complaintCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your report");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="report-success">
        <div className="success-mark">
          <Check size={30} />
        </div>
        <p className="public-kicker">{t("report.successKicker")}</p>
        <h1>{t("report.successTitle")}</h1>
        <p>
          {t("report.trackWith")} <strong>#{submitted}</strong>
        </p>
        <div className="success-actions">
          <Link href="/my-reports" className="public-primary">
            {t("myReports.title")} <ArrowRight size={15} />
          </Link>
          <button
            className="light-button"
            onClick={() => {
              setSubmitted(null);
              setDescription("");
            }}
          >
            {t("report.another")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page">
      <header className="report-nav">
        <LiveBrandLockup size={34} className="public-brand" />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LanguageToggle />
          <Link href="/" className="back-link">
            <ArrowLeft size={15} /> {t("common.back")}
          </Link>
        </div>
      </header>

      <main className="report-layout">
        <div className="report-intro">
          <p className="public-kicker">{t("report.kicker")}</p>
          <h1>
            {t("report.title1")}
            <br />
            <em>{t("report.title2")}</em>
          </h1>
          <p>{t("report.body")}</p>

          <div className="report-benefits">
            <span>
              <ShieldCheck size={16} /> {t("report.privacy")}
            </span>
            <span>
              <Check size={16} />{" "}
              {t("report.trackProgress")}
            </span>
          </div>

          {/* The low-tech channel — the equity half of citizen-in-the-loop. */}
          <div className="report-note">
            <div className="note-symbol">
              <MessageSquare size={17} />
            </div>
            <p>
              <strong>{t("report.smsAlt")}</strong>
              <br />
              <code
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 15,
                  background: "rgba(255,255,255,.6)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  display: "inline-block",
                  marginTop: 7,
                }}
              >
                BIN {selectedBin?.binCode ?? "W27-B001"} FULL
              </code>
              <br />
              <span style={{ fontSize: 14, opacity: 0.8 }}>
                {t("report.smsBangla")}
              </span>
            </p>
          </div>
        </div>

        <form className="report-form-card" onSubmit={e => void submit(e)}>
          <div className="form-top">
            <div>
              <span className="form-step">{t("report.step")}</span>
              <h2>{t("report.issueType")}</h2>
            </div>
            <span className="form-progress">
              <i />
            </span>
          </div>

          <div className="issue-options">
            {COMPLAINT_TYPES.filter(t2 => t2 !== "other").map(type => (
              <button
                type="button"
                key={type}
                className={issue === type ? "selected" : ""}
                onClick={() => setIssue(type)}
              >
                <span className="issue-radio">{issue === type && <i />}</span>
                {COMPLAINT_TYPE_LABELS[type][lang]}
              </button>
            ))}
          </div>

          <label>{t("report.whichBin")}</label>
          <div className="location-input">
            <MapPin size={16} />
            <select
              value={binId ?? ""}
              onChange={e => setBinId(Number(e.target.value))}
              style={{
                flex: 1,
                border: 0,
                background: "transparent",
                outline: "none",
                fontSize: 15.5,
                padding: "2px 0",
              }}
            >
              <option value="">{t("report.selectBin")}</option>
              {bins.map(b => (
                <option key={b.binId} value={b.binId}>
                  {(lang === "bn" && b.landmarkBn ? b.landmarkBn : b.landmark)} — {b.binCode} (
                  {b.wardName})
                </option>
              ))}
            </select>
          </div>

          <label>
            {t("report.details")} <small>{t("common.optional")}</small>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t("report.detailsPlaceholder")}
            maxLength={1000}
          />

          {error && <p className="form-error">{error}</p>}

          {!user && (
            <p className="form-error" style={{ background: "rgba(240,184,74,.14)", color: "#a5761c" }}>
              {t("report.signInFirst")} — <Link href="/login">sign in</Link> /{" "}
              <Link href="/register">register</Link>
            </p>
          )}

          <div className="form-footer">
            <span>
              <ShieldCheck size={14} /> {t("report.privacy")}
            </span>
            <button className="public-primary" type="submit" disabled={busy || !user}>
              {busy ? <span className="spinner" /> : null} {t("report.submit")}{" "}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </main>

      <footer className="report-footer">
        <span>SafaiTrack · {t("report.kicker")}</span>
        <span>{t("report.footerNote")}</span>
      </footer>
    </div>
  );
}
