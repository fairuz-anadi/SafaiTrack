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
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LanguageToggle } from "@/lib/i18n";
import { relativeTime } from "@/lib/format";
import { ROLE_LABELS } from "@shared/types";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Grid2X2;
  roles: string[];
}

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: Grid2X2, roles: ["staff"] },
  { label: "Live bins", href: "/bins", icon: Boxes, roles: ["staff", "officer"] },
  { label: "Routes", href: "/routes", icon: RouteIcon, roles: ["staff"] },
  { label: "Impact proof", href: "/impact", icon: TrendingUp, roles: ["staff", "officer"] },
  { label: "Complaints", href: "/complaints", icon: FileText, roles: ["staff", "officer"] },
  { label: "Fleet", href: "/fleet", icon: Truck, roles: ["staff"] },
  { label: "Analytics", href: "/analytics", icon: Gauge, roles: ["staff", "officer"] },
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
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu">
          <X size={18} />
        </button>

        <div className="workspace-switcher">
          <div className="ward-avatar">D</div>
          <div>
            <small>Signed in as</small>
            <strong>{ROLE_LABELS[user.role].en}</strong>
          </div>
        </div>

        <nav className="nav-list">
          <p className="nav-label">Operations</p>
          {items.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${location === href ? "active" : ""}`}
              onClick={() => setMobileNav(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div style={{ padding: "0 6px 12px" }}>
            <LanguageToggle />
          </div>
          <div className="profile-row">
            <div className="profile-avatar">{initials}</div>
            <div>
              <strong>{user.fullName}</strong>
              <small>{ROLE_LABELS[user.role].en}</small>
            </div>
            <button onClick={() => void logout()} aria-label="Sign out">
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
                    .toLocaleDateString("en-GB", {
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
              <input placeholder="Search bins, routes, complaints" />
            </div>
            <button className="icon-button" onClick={openNotifications} aria-label="Notifications">
              <Bell size={18} />
              {unread > 0 && <i />}
            </button>
            <div className="top-avatar">{initials}</div>
          </div>

          {showNotifications && (
            <div className="notification-pop">
              <div className="pop-title">
                <strong>Notifications</strong>
                <span>{notifications.length}</span>
              </div>
              {notifications.length === 0 && (
                <p style={{ padding: "14px 4px", color: "var(--muted)", fontSize: 13 }}>
                  Nothing yet.
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
