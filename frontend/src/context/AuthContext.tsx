import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { AuthMe } from "../../../common/models/auth";
import { api } from "../util/api.ts";

interface AuthContextValue {
  me: AuthMe | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** `/api/auth/discord?next=...`, for a plain `<a href>` — this is a full-page navigation. */
  loginHref: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth state, modelled on SidebarContext. `/api/auth/me` is never SSR'd, so both
 * the server and the initial client render start from `{me: null, loading: true}`
 * and the real fetch happens in a useEffect, to keep hydration matching.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await api.api.auth.me.get();
      if (error || !data) {
        setMe(null);
        return;
      }
      setMe(data);
    } catch {
      // Any error/non-2xx from /me is treated as logged out.
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Only on mount — subsequent refreshes are explicit (post-login redirect, logout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.api.auth.logout.post();
    } catch {
      // Best-effort: fall through to clearing local state regardless.
    } finally {
      setMe(null);
    }
  }, []);

  // searchStr already carries its leading "?" (router href = pathname + searchStr + hash).
  const nextPath = pathname + searchStr;
  const loginHref = `/api/auth/discord?next=${encodeURIComponent(nextPath)}`;

  const value: AuthContextValue = {
    me,
    loading,
    refresh,
    logout,
    loginHref,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
