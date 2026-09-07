import { Redirect, Route, Switch } from "wouter";
import { AuthProvider, useAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { ROLE_HOME, type Role } from "@shared/types";

import Landing from "@/pages/Landing";
import About from "@/pages/About";
import Team from "@/pages/Team";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Report from "@/pages/Report";
import MyReports from "@/pages/MyReports";
import Dashboard from "@/pages/Dashboard";
import Bins from "@/pages/Bins";
import BinDetail from "@/pages/BinDetail";
import RoutesPage from "@/pages/Routes";
import RouteDetail from "@/pages/RouteDetail";
import Impact from "@/pages/Impact";
import Complaints from "@/pages/Complaints";
import Fleet from "@/pages/Fleet";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import ProfilePage from "@/pages/Profile";
import DriverRoute from "@/pages/DriverRoute";

/**
 * Route guard. Unauthenticated visitors go to sign-in; a signed-in user who
 * lands on a page outside their role is sent to their own home rather than
 * shown a permission error they cannot act on.
 */
function Protected({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-block" style={{ minHeight: "100vh" }}>
        <span className="spinner" /> Loading SafaiTrack…
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  if (!roles.includes(user.role)) return <Redirect to={ROLE_HOME[user.role]} />;
  return <>{children}</>;
}

/** Sends an already-signed-in user away from the auth pages. */
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Redirect to={ROLE_HOME[user.role]} />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Landing} />
      <Route path="/report" component={Report} />
      <Route path="/about" component={About} />
      <Route path="/team" component={Team} />
      <Route path="/login">
        <GuestOnly>
          <Login />
        </GuestOnly>
      </Route>
      <Route path="/register">
        <GuestOnly>
          <Register />
        </GuestOnly>
      </Route>

      {/* Citizen */}
      <Route path="/my-reports">
        <Protected roles={["citizen"]}>
          <MyReports />
        </Protected>
      </Route>

      {/* Municipal staff */}
      <Route path="/dashboard">
        <Protected roles={["staff"]}>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/routes">
        <Protected roles={["staff"]}>
          <RoutesPage />
        </Protected>
      </Route>
      <Route path="/routes/:id">
        <Protected roles={["staff", "officer"]}>
          <RouteDetail />
        </Protected>
      </Route>
      <Route path="/fleet">
        <Protected roles={["staff"]}>
          <Fleet />
        </Protected>
      </Route>

      {/* Staff and ward officers */}
      <Route path="/bins">
        <Protected roles={["staff", "officer"]}>
          <Bins />
        </Protected>
      </Route>
      <Route path="/bins/:id">
        <Protected roles={["staff", "officer"]}>
          <BinDetail />
        </Protected>
      </Route>
      <Route path="/profile">
        <Protected roles={["staff", "officer", "driver", "citizen"]}>
          <ProfilePage />
        </Protected>
      </Route>
      <Route path="/settings">
        <Protected roles={["staff", "officer"]}>
          <Settings />
        </Protected>
      </Route>
      <Route path="/impact">
        <Protected roles={["staff", "officer"]}>
          <Impact />
        </Protected>
      </Route>
      <Route path="/complaints">
        <Protected roles={["staff", "officer"]}>
          <Complaints />
        </Protected>
      </Route>
      <Route path="/analytics">
        <Protected roles={["staff", "officer"]}>
          <Analytics />
        </Protected>
      </Route>

      {/* Ward officer home — the complaint desk scoped to their ward */}
      <Route path="/officer">
        <Protected roles={["officer"]}>
          <Complaints />
        </Protected>
      </Route>

      {/* Driver */}
      <Route path="/driver">
        <Protected roles={["driver"]}>
          <DriverRoute />
        </Protected>
      </Route>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </I18nProvider>
  );
}
