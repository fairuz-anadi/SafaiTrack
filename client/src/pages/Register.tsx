/** Citizen self-registration. Municipal roles are provisioned, not signed up for. */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Leaf, MapPin, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { useAuth } from "@/lib/auth";
import { LanguageToggle, useI18n } from "@/lib/i18n";

interface Ward {
  wardId: number;
  name: string;
  wardCode: string;
}

export default function Register() {
  const { register } = useAuth();
  const { t, lang } = useI18n();
  const [wards, setWards] = useState<Ward[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    wardId: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ wards: Ward[] }>("/wards")
      .then(r => setWards(r.wards))
      .catch(() => setWards([]));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        wardId: form.wardId ? Number(form.wardId) : undefined,
        address: form.address || undefined,
        preferredLanguage: lang,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account");
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside ambient-host">
        <AmbientNetwork tone="dark" intensity={0.85} density={0.75} />
        <Link href="/" className="public-brand" style={{ position: "relative", zIndex: 2 }}>
          <span className="public-brand-mark">
            <Leaf size={17} fill="currentColor" />
          </span>
          <span>
            <b style={{ color: "#f3f7ef" }}>
              Safai<span style={{ color: "var(--lime)" }}>Track</span>
            </b>
            <small style={{ color: "rgba(243,247,239,.5)" }}>Dhaka City Operations</small>
          </span>
        </Link>

        <div style={{ position: "relative", zIndex: 2 }}>
          <h2>
            {t("auth.regAside1")}
            <br />
            <em>{t("auth.regAside2")}</em>
          </h2>
          <p>{t("auth.regAsideBody")}</p>
        </div>

        <div className="auth-points">
          <div>
            <MapPin size={17} />
            <span>{t("auth.regPoint1")}</span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <span>{t("auth.regPoint2")}</span>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p className="public-kicker">{t("auth.registerKicker")}</p>
            <LanguageToggle />
          </div>
          <h1>{t("auth.registerTitle")}</h1>
          <p>{t("auth.registerSub")}</p>

          <form onSubmit={e => void submit(e)}>
            {error && <div className="auth-error">{error}</div>}

            <label className="auth-field">
              <span>{t("auth.fullName")}</span>
              <input value={form.fullName} onChange={set("fullName")} required minLength={2} />
            </label>

            <label className="auth-field">
              <span>{t("auth.email")}</span>
              <input type="email" value={form.email} onChange={set("email")} required />
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

            <label className="auth-field">
              <span>{t("auth.address")}</span>
              <input
                value={form.address}
                onChange={set("address")}
                placeholder={t("auth.addressPlaceholder")}
              />
            </label>

            <label className="auth-field">
              <span>{t("auth.passwordRule")}</span>
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <ArrowRight size={16} />} {t("auth.createBtn")}
            </button>
          </form>

          <p className="auth-alt">
            {t("auth.alreadyRegistered")} <Link href="/login">{t("auth.signInBtn")}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
