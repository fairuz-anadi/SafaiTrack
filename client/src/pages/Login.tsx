/** Sign-in. Carries one-click demo accounts so a judge never types a password. */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Leaf, Radio, ShieldCheck, TrendingDown } from "lucide-react";
import { AmbientNetwork } from "@/components/ambient/AmbientNetwork";
import { useAuth } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  { role: "Municipal staff", email: "staff@safaitrack.gov.bd", note: "Full operations" },
  { role: "Ward officer", email: "officer27@safaitrack.gov.bd", note: "Dhanmondi complaints" },
  { role: "Truck driver", email: "rafiq@safaitrack.gov.bd", note: "Route execution" },
  { role: "Citizen", email: "citizen@example.com", note: "Report and track" },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent, asEmail?: string) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(asEmail ?? email, asEmail ? "safai1234" : password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
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
            Waste collection that
            <br />
            <em>responds to the street.</em>
          </h2>
          <p>
            Bin signals, citizen reports and truck routes in one system — built to run on a city
            corporation's existing budget, with no per-bin hardware.
          </p>
        </div>

        <div className="auth-points">
          <div>
            <TrendingDown size={17} />
            <span>Measured route savings against the fixed schedule, not estimates</span>
          </div>
          <div>
            <Radio size={17} />
            <span>Citizens report by web, SMS or USSD — no smartphone required</span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <span>Every complaint status change is permanently attributable</span>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <p className="public-kicker">SIGN IN</p>
          <h1>Welcome back.</h1>
          <p>Access is scoped to your role — staff, ward officer, driver or citizen.</p>

          <form onSubmit={e => void submit(e)}>
            {error && <div className="auth-error">{error}</div>}

            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="username"
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </label>

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <ArrowRight size={16} />} Sign in
            </button>
          </form>

          <p className="auth-alt">
            New resident? <Link href="/register">Create an account</Link>
          </p>

          <div className="demo-accounts">
            <strong>Demo accounts — one click</strong>
            {DEMO_ACCOUNTS.map(a => (
              <button key={a.email} onClick={e => void submit(e, a.email)} disabled={busy}>
                <span>
                  <b>{a.role}</b> — {a.note}
                </span>
                <em>{a.email}</em>
              </button>
            ))}
            <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "9px 0 0", paddingLeft: 9 }}>
              Password for all demo accounts: <code>safai1234</code>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
