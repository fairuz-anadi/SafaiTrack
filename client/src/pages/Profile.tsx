/**
 * Your own account.
 *
 * Deliberately narrow about what can change: name, phone, address, ward and
 * language. Email is identity and role is privilege — both belong with the
 * city corporation, not with a self-service form, so they are shown read-only
 * with the reason stated.
 */
import { useEffect, useState } from "react";
import { Check, Lock, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type StringKey } from "@/lib/i18n";
import { dateTime } from "@/lib/format";

interface Profile {
  userId: number;
  role: string;
  fullName: string;
  email: string;
  phone: string | null;
  preferredLanguage: "en" | "bn";
  createdAt: string;
  /* citizen */
  address?: string | null;
  wardId?: number | null;
  trustScore?: number | null;
  reportsFiled?: number;
  reportsConfirmed?: number;
  /* staff / officer */
  employeeNo?: string;
  designation?: string | null;
  cityCorporation?: string | null;
  officeContact?: string | null;
  /* driver */
  licenseNo?: string;
  licenseExpiry?: string | null;
  shift?: string;
}

interface Ward {
  wardId: number;
  name: string;
  wardCode: string;
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { t, lang } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [form, setForm] = useState({ fullName: "", phone: "", address: "", wardId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const [p, w] = await Promise.all([
        api.get<{ profile: Profile }>("/auth/me/profile"),
        api.get<{ wards: Ward[] }>("/wards"),
      ]);
      setProfile(p.profile);
      setWards(w.wards);
      setForm({
        fullName: p.profile.fullName,
        phone: p.profile.phone ?? "",
        address: p.profile.address ?? "",
        wardId: p.profile.wardId ? String(p.profile.wardId) : "",
      });
    })().catch(() => setError("Could not load your profile"));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.patch("/auth/me/profile", {
        fullName: form.fullName,
        phone: form.phone || undefined,
        ...(profile?.role === "citizen"
          ? { address: form.address, wardId: form.wardId ? Number(form.wardId) : undefined }
          : {}),
      });
      setSaved(true);
      // The sidebar shows the name, so refresh the session copy too.
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your changes");
    } finally {
      setBusy(false);
    }
  };

  if (!user || !profile) {
    return (
      <AppShell title={t("profile.title")}>
        <div className="loading-block">
          <span className="spinner" /> {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  const isCitizen = profile.role === "citizen";
  const initials = profile.fullName
    .split(" ")
    .map(p => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell title={t("profile.title")} eyebrow={t("profile.eyebrow")}>
      <section className="dashboard-grid">
        <form className="panel-card padded lift" onSubmit={e => void save(e)}>
          <div className="panel-heading">
            <div>
              <p className="section-kicker">{t("profile.editable")}</p>
              <h3>{t("profile.yourDetails")}</h3>
            </div>
            <UserRound size={18} style={{ color: "var(--muted)" }} />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <label className="auth-field">
            <span>{t("auth.fullName")}</span>
            <input value={form.fullName} onChange={set("fullName")} required minLength={2} />
          </label>

          <label className="auth-field">
            <span>{t("auth.mobile")}</span>
            <input
              value={form.phone}
              onChange={set("phone")}
              placeholder="01712345678"
              pattern="01[3-9][0-9]{8}"
            />
          </label>

          {isCitizen && (
            <>
              <label className="auth-field">
                <span>{t("auth.address")}</span>
                <input
                  value={form.address}
                  onChange={set("address")}
                  placeholder={t("auth.addressPlaceholder")}
                />
              </label>

              <label className="auth-field">
                <span>{t("auth.yourWard")}</span>
                <select value={form.wardId} onChange={set("wardId")}>
                  <option value="">{t("auth.selectWard")}</option>
                  {wards.map(w => (
                    <option key={w.wardId} value={w.wardId}>
                      {w.name} ({w.wardCode})
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : saved ? <Check size={16} /> : null}{" "}
            {saved ? t("profile.saved") : t("common.save")}
          </button>
        </form>

        <div className="side-column">
          <div className="panel-card padded lift">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("profile.identity")}</p>
                <h3>{t("profile.managedByCity")}</h3>
              </div>
              <Lock size={17} style={{ color: "var(--muted)" }} />
            </div>

            <div className="profile-hero">
              <div className="profile-hero-avatar">{initials}</div>
              <div>
                <strong>{profile.fullName}</strong>
                <small>{t(`role.${profile.role}` as StringKey)}</small>
              </div>
            </div>

            <div className="impact-rows">
              <div>
                <span>{t("auth.email")}</span>
                <b style={{ fontSize: 12.5 }}>{profile.email}</b>
              </div>
              <div>
                <span>{t("settings.role")}</span>
                <b>{t(`role.${profile.role}` as StringKey)}</b>
              </div>
              {profile.employeeNo && (
                <div>
                  <span>{t("profile.employeeNo")}</span>
                  <b className="figure">{profile.employeeNo}</b>
                </div>
              )}
              {profile.designation && (
                <div>
                  <span>{t("profile.designation")}</span>
                  <b>{profile.designation}</b>
                </div>
              )}
              {profile.licenseNo && (
                <div>
                  <span>{t("profile.license")}</span>
                  <b className="figure">{profile.licenseNo}</b>
                </div>
              )}
              {profile.shift && (
                <div>
                  <span>{t("profile.shift")}</span>
                  <b>{profile.shift}</b>
                </div>
              )}
              <div>
                <span>{t("profile.memberSince")}</span>
                <b className="figure">{dateTime(profile.createdAt)}</b>
              </div>
            </div>

            <p className="lock-note">
              <ShieldCheck size={14} /> {t("profile.lockNote")}
            </p>
          </div>

          {isCitizen && (
            <div className="panel-card padded lift">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">{t("profile.contribution")}</p>
                  <h3>{t("profile.yourReports")}</h3>
                </div>
              </div>
              <div className="contribution-grid">
                <div>
                  <strong className="figure">{profile.reportsFiled ?? 0}</strong>
                  <span>{t("profile.filed")}</span>
                </div>
                <div>
                  <strong className="figure">{profile.reportsConfirmed ?? 0}</strong>
                  <span>{t("profile.confirmed")}</span>
                </div>
                <div>
                  <strong className="figure">{Math.round(profile.trustScore ?? 0)}</strong>
                  <span>{t("profile.trust")}</span>
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "12px 0 0", lineHeight: 1.6 }}>
                {t("profile.trustNote")}
              </p>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
