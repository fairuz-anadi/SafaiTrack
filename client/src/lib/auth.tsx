/** Session context: who is signed in, and the sign-in / sign-out actions. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ROLE_HOME, type AuthUser } from "@shared/types";
import { api, setToken } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    wardId?: number;
    address?: string;
    preferredLanguage?: "en" | "bn";
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.get<{ user: AuthUser }>("/auth/me");
      setUser(me);
    } catch {
      // No valid session — that is a normal state, not an error.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ user: AuthUser; token: string }>("/auth/login", {
        email,
        password,
      });
      setToken(res.token);
      setUser(res.user);
      navigate(ROLE_HOME[res.user.role]);
      return res.user;
    },
    [navigate]
  );

  const register = useCallback<AuthContextValue["register"]>(
    async input => {
      const res = await api.post<{ user: AuthUser; token: string }>("/auth/register", {
        ...input,
        role: "citizen",
        preferredLanguage: input.preferredLanguage ?? "en",
      });
      setToken(res.token);
      setUser(res.user);
      navigate(ROLE_HOME[res.user.role]);
      return res.user;
    },
    [navigate]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setToken(null);
      setUser(null);
      navigate("/");
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
