/** Signed-in application shell: sidebar navigation, topbar, notifications. */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  Boxes,
  FileText,
  Gauge,
  Grid2X2,
  Leaf,
  LogOut,
  Menu,
  Route as RouteIcon,
  Search,
  Settings2,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LanguageToggle, useI18n, type StringKey } from "@/lib/i18n";
import { relativeTime } from "@/lib/format";

interface NavItem {
  labelKey: StringKey;
  href: string;
  icon: typeof Grid2X2;
  roles: string[];
}

const NAV: NavItem[] = [
  { labelKey: "nav.overview", href: "/dashboard", icon: Grid2X2, roles: ["staff"] },
  { labelKey: "nav.liveBins", href: "/bins", icon: Boxes, roles: ["staff", "officer"] },
  { labelKey: "nav.routes", href: "/routes", icon: RouteIcon, roles: ["staff"] },
  { labelKey: "nav.impactProof", href: "/impact", icon: TrendingUp, roles: ["staff", "officer"] },
  { labelKey: "nav.complaints", href: "/complaints", icon: FileText, roles: ["staff", "officer"] },
  { labelKey: "nav.fleet", href: "/fleet", icon: Truck, roles: ["staff"] },
  { labelKey: "nav.analytics", href: "/analytics", icon: Gauge, roles: ["staff", "officer"] },
  { labelKey: "nav.settings", href: "/settings", icon: Settings2, roles: ["staff", "officer"] },
];

interface NotificationRow {
  notificationId: number;
  title: string;
  message: string;
  notificationType: string;
  deliveryStatus: string;
  createdAt: string;
}

export function AppShell({
  children,
  title,
  eyebrow,
}: {
  children: ReactNode;
  title: string;
  eyebrow?: string;
}) {
  const { user, logout } = useAuth();
  const { t, lang } = useI18n();
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get<{ notifications: NotificationRow[]; unread: number }>(
          "/notifications"
        );
        if (!cancelled) {
          setNotifications(res.notifications);
          setUnread(res.unread);
        }
      } catch {
        /* notifications are non-critical */
      }
    };
    void load();
    const timer = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!user) return null;

  const items = NAV.filter(n => n.roles.includes(user.role));
  const initials = user.fullName
    .split(" ")
    .map(p => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = t(`role.${user.role}` as StringKey);

  const openNotifications = async () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next && unread > 0) {
      try {
        await api.post("/notifications/read");
        setUnread(0);
      } catch {
        /* leave the badge alone if the write fails */
      }
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Leaf size={17} fill="currentColor" />
          </div>
          <div>
            <b>
              Safai<span>Track</span>
            </b>
            <small>Dhaka City Operations</small>
          </div>
        </div>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label={t("common.close")}>
          <X size={18} />
        </button>

        <div className="workspace-switcher">
          <div className="ward-avatar">D</div>
          <div>
            <small>{t("nav.signedInAs")}</small>
            <strong>{roleLabel}</strong>
          </div>
        </div>

        <nav className="nav-list">
          <p className="nav-label">{t("nav.operations")}</p>
          {items.map(({ labelKey, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${location === href ? "active" : ""}`}
              onClick={() => setMobileNav(false)}
            >
              <Icon size={18} />
              <span>{t(labelKey)}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div style={{ padding: "0 6px 12px" }}>
            <LanguageToggle compact />
          </div>
          <div className="profile-row">
            <div className="profile-avatar">{initials}</div>
            <div>
              <strong>{user.fullName}</strong>
              <small>{roleLabel}</small>
            </div>
            <button onClick={() => void logout()} aria-label={t("common.signOut")}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" onClick={() => setMobileNav(true)} aria-label="Menu">
              <Menu size={20} />
            </button>
            <div>
              <p className="eyebrow">
                {eyebrow ??
                  new Date()
                    .toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                    .toUpperCase()}
              </p>
              <h1>{title}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <Search size={17} />
              <input placeholder={t("common.search")} />
            </div>
            <button className="icon-button" onClick={openNotifications} aria-label={t("common.notifications")}>
              <Bell size={18} />
              {unread > 0 && <i />}
            </button>
            <div className="top-avatar">{initials}</div>
          </div>

          {showNotifications && (
            <div className="notification-pop">
              <div className="pop-title">
                <strong>{t("common.notifications")}</strong>
                <span>{notifications.length}</span>
              </div>
              {notifications.length === 0 && (
                <p style={{ padding: "14px 4px", color: "var(--muted)", fontSize: 13 }}>
                  {t("common.nothingYet")}
                </p>
              )}
              {notifications.slice(0, 8).map(n => (
                <div className="notice" key={n.notificationId}>
                  <span
                    className={`notice-dot ${
                      n.notificationType === "bin_critical"
                        ? "coral"
                        : n.notificationType === "route_assigned"
                          ? "lime"
                          : "blue"
                    }`}
                  />
                  <div>
                    <strong>{n.title}</strong>
                    <small>
                      {n.message} · {relativeTime(n.createdAt)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </header>

        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}
