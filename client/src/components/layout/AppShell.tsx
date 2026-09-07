/** Signed-in application shell: sidebar navigation, topbar, notifications. */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  Boxes,
  FileText,
  Gauge,
  Grid2X2,
  LogOut,
  Menu,
  Route as RouteIcon,
  Search,
  Settings2,
  TrendingUp,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { LiveBrandLockup } from "@/components/brand/InteractiveLogo";
import { useRevealOnScroll } from "@/hooks/useMotion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LanguageToggle, useI18n, type StringKey } from "@/lib/i18n";
import { clockTime, relativeTime } from "@/lib/format";

interface NavItem {
  labelKey: StringKey;
  href: string;
  icon: typeof Grid2X2;
  roles: string[];
  /** Which live figure to show as a badge, if any. */
  badge?: "critical" | "openComplaints" | "activeRoutes";
}

interface NavGroup {
  labelKey: StringKey;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    labelKey: "nav.operations",
    items: [
      { labelKey: "nav.overview", href: "/dashboard", icon: Grid2X2, roles: ["staff"] },
      {
        labelKey: "nav.liveBins",
        href: "/bins",
        icon: Boxes,
        roles: ["staff", "officer"],
        badge: "critical",
      },
      {
        labelKey: "nav.routes",
        href: "/routes",
        icon: RouteIcon,
        roles: ["staff"],
        badge: "activeRoutes",
      },
      {
        labelKey: "nav.complaints",
        href: "/complaints",
        icon: FileText,
        roles: ["staff", "officer"],
        badge: "openComplaints",
      },
      { labelKey: "nav.fleet", href: "/fleet", icon: Truck, roles: ["staff"] },
    ],
  },
  {
    labelKey: "nav.insight",
    items: [
      { labelKey: "nav.impactProof", href: "/impact", icon: TrendingUp, roles: ["staff", "officer"] },
      { labelKey: "nav.analytics", href: "/analytics", icon: Gauge, roles: ["staff", "officer"] },
    ],
  },
  {
    labelKey: "nav.account",
    items: [
      { labelKey: "nav.profile", href: "/profile", icon: UserRound, roles: ["staff", "officer"] },
      { labelKey: "nav.settings", href: "/settings", icon: Settings2, roles: ["staff", "officer"] },
    ],
  },
];

interface NotificationRow {
  notificationId: number;
  title: string;
  message: string;
  notificationType: string;
  deliveryStatus: string;
  createdAt: string;
}

/** The handful of live figures the sidebar surfaces. */
interface SidebarCounts {
  critical: number;
  openComplaints: number;
  activeRoutes: number;
  simClock: string | null;
  ticksElapsed: number;
  isRunning: boolean;
  lastSync: string;
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
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  /* Scroll reveal used to be a landing-page trick. Observing from the shell
     means any signed-in page can mark a block `.reveal` and get the same
     behaviour without wiring its own observer. */
  const revealRef = useRevealOnScroll<HTMLDivElement>(location);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [notif, overview] = await Promise.all([
          api.get<{ notifications: NotificationRow[]; unread: number }>("/notifications"),
          api.get<{
            bins: { critical: number };
            complaints: { open: number };
            routes: { active: number };
            simulation: { simClock: string; ticksElapsed: number; isRunning: boolean };
          }>("/analytics/overview"),
        ]);
        if (cancelled) return;
        setNotifications(notif.notifications);
        setUnread(notif.unread);
        setCounts({
          critical: overview.bins.critical,
          openComplaints: overview.complaints.open,
          activeRoutes: overview.routes.active,
          simClock: overview.simulation.simClock,
          ticksElapsed: overview.simulation.ticksElapsed,
          isRunning: overview.simulation.isRunning,
          lastSync: new Date().toISOString(),
        });
      } catch {
        /* the sidebar is chrome — it should never take the page down */
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

  const initials = user.fullName
    .split(" ")
    .map(p => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = t(`role.${user.role}` as StringKey);

  const badgeValue = (kind: NavItem["badge"]): number | null => {
    if (!kind || !counts) return null;
    const n = counts[kind];
    return n > 0 ? n : null;
  };

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
          {/* No brand card in here: `.sidebar` is `overflow: hidden`, which would
              clip it. The mark still tilts and bursts. */}
          <LiveBrandLockup size={38} tone="dark" href="/dashboard" popover={false} />
        </div>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label={t("common.close")}>
          <X size={18} />
        </button>

        <div className="workspace-switcher">
          <div className="ward-avatar">{user.wardId ? String(user.wardId) : "D"}</div>
          <div>
            <small>{t("nav.signedInAs")}</small>
            <strong>{roleLabel}</strong>
          </div>
        </div>

        {/* The nav scrolls on its own so the profile row below can never be
            clipped off the bottom on a short viewport. */}
        <nav className="nav-list">
          {NAV.map((group, gi) => {
            const items = group.items.filter(n => n.roles.includes(user.role));
            if (items.length === 0) return null;
            return (
              <div key={group.labelKey}>
                <p className={`nav-label ${gi > 0 ? "secondary-label" : ""}`}>{t(group.labelKey)}</p>
                {items.map(({ labelKey, href, icon: Icon, badge }) => {
                  const count = badgeValue(badge);
                  const active = location === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`nav-item ${active ? "active" : ""}`}
                      onClick={() => setMobileNav(false)}
                    >
                      <Icon size={18} />
                      <span>{t(labelKey)}</span>
                      {count !== null && (
                        <em className={badge === "critical" ? "hot" : ""}>{count}</em>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {/* Live status: the simulation clock is the one thing on screen that
              proves the numbers are actually moving. */}
          <div className="system-card">
            <div className={`system-pulse ${counts && !counts.isRunning ? "idle" : ""}`}>
              <span />
            </div>
            <div>
              <strong>{t(counts && !counts.isRunning ? "nav.simPaused" : "nav.simActive")}</strong>
              <small>
                {counts?.simClock ? clockTime(counts.simClock) : "—"} · {t("sim.tick")}{" "}
                {counts?.ticksElapsed ?? 0}
              </small>
            </div>
          </div>

          <div className="sidebar-lang">
            <LanguageToggle compact />
            {counts && <span className="sync-note">{relativeTime(counts.lastSync)}</span>}
          </div>

          <div className="profile-row">
            <Link href="/profile" className="profile-id" onClick={() => setMobileNav(false)}>
              <div className="profile-avatar">{initials}</div>
              <div>
                <strong>{user.fullName}</strong>
                <small>{roleLabel}</small>
              </div>
            </Link>
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
                <p style={{ padding: "14px 4px", color: "var(--muted)", fontSize: 15 }}>
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

        <div className="page-wrap" key={location} ref={revealRef}>
          {children}
        </div>
      </main>

      {/* Tapping outside closes the drawer on mobile. */}
      {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
    </div>
  );
}
