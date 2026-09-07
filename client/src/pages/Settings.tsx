/** Account, language and build information. */
import { useEffect, useState } from "react";
import { Bot, Database, Globe, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type Lang, type StringKey } from "@/lib/i18n";

interface AgentStatus {
  claudeConfigured: boolean;
  model: string;
  tools: string[];
  offlineFallback: boolean;
}

interface Health {
  ok: boolean;
  database: string;
  time: string;
}

export default function Settings() {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.get<AgentStatus>("/agent/status").then(setAgent).catch(() => setAgent(null));
    api.get<Health>("/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  if (!user) return null;

  const LANGS: { value: Lang; label: string; native: string }[] = [
    { value: "en", label: "English", native: "English" },
    { value: "bn", label: "Bangla", native: "বাংলা" },
  ];

  return (
    <AppShell title={t("settings.title")} eyebrow={t("settings.eyebrow")}>
      <section className="dashboard-grid">
        <div>
          <div className="panel-card padded lift" style={{ marginBottom: 18 }}>
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("settings.language")}</p>
                <h3>{t("settings.choose")}</h3>
              </div>
              <Globe size={18} style={{ color: "var(--muted)" }} />
            </div>

            <div className="lang-grid">
              {LANGS.map(l => (
                <button
                  key={l.value}
                  className={`lang-card ${lang === l.value ? "active" : ""}`}
                  onClick={() => setLang(l.value)}
                  aria-pressed={lang === l.value}
                >
                  <strong>{l.native}</strong>
                  <small>{l.label}</small>
                  {lang === l.value && <span className="lang-tick">✓</span>}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 14, color: "var(--muted)", margin: "14px 0 0", lineHeight: 1.65 }}>
              {t("settings.langNote")}
            </p>
          </div>

          <div className="panel-card padded lift">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("settings.system")}</p>
                <h3>{t("settings.about")}</h3>
              </div>
            </div>
            <div className="impact-rows">
              <div>
                <span>
                  <Bot size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {t("settings.aiEngine")}
                </span>
                <b>
                  {agent?.claudeConfigured ? agent.model : t("settings.offlineAdvisor")}
                </b>
              </div>
              <div>
                <span>
                  <Database size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {t("settings.database")}
                </span>
                <b>{health?.database ?? "—"}</b>
              </div>
              <div>
                <span>
                  <ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {t("settings.assistantTools")}
                </span>
                <b>
                  {agent?.tools.length ?? 0} {t("settings.readOnly")}
                </b>
              </div>
            </div>

            {agent && (
              <div className="agent-tools" style={{ borderTop: "1px dashed var(--line)", marginTop: 12 }}>
                {agent.tools.map(name => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="side-column">
          <div className="panel-card padded lift">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">{t("settings.profile")}</p>
                <h3>{t("settings.yourDetails")}</h3>
              </div>
              <UserRound size={18} style={{ color: "var(--muted)" }} />
            </div>
            <div className="impact-rows">
              <div>
                <span>{t("settings.name")}</span>
                <b>{user.fullName}</b>
              </div>
              <div>
                <span>{t("auth.email")}</span>
                <b style={{ fontSize: 14 }}>{user.email}</b>
              </div>
              <div>
                <span>{t("settings.role")}</span>
                <b>{t(`role.${user.role}` as StringKey)}</b>
              </div>
              {user.wardId && (
                <div>
                  <span>{t("common.ward")}</span>
                  <b>#{user.wardId}</b>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
