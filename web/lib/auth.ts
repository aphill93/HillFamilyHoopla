"use client";

// ─── Auth helpers (client-side) ───────────────────────────────────────────────
//
// Tokens are stored in:
//   - localStorage  for the access token (short-lived; acceptable for SPA)
//   - httpOnly cookie is ideal but requires server cooperation.
//     For now we use localStorage + in-memory cache.
//
// The AuthProvider (in this file) wraps the app and provides useAuth().

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AuthToken,
  LoginRequest,
  UserProfile,
  LoginResponse,
} from "@hillfamilyhoopla/shared";

// ─── Token storage ────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = "hfh_access_token";
const REFRESH_TOKEN_KEY = "hfh_refresh_token";
const EXPIRES_AT_KEY = "hfh_expires_at";

export function getTokens(): AuthToken | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: Number(expiresAt ?? 0),
    tokenType: "Bearer",
  };
}

export function setTokens(tokens: AuthToken): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  localStorage.setItem(EXPIRES_AT_KEY, String(tokens.expiresAt));
  // Sync to cookie so Next.js middleware (edge runtime) can check auth state.
  // Not httpOnly by design — middleware uses it only for redirect decisions;
  // all security enforcement happens on the API via JWT verification.
  const maxAge = tokens.expiresAt - Math.floor(Date.now() / 1000);
  document.cookie = `${ACCESS_TOKEN_KEY}=${tokens.accessToken}; path=/; SameSite=Strict; max-age=${maxAge}`;
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  // Clear the middleware cookie
  document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; SameSite=Strict; max-age=0`;
}

export function isTokenExpired(): boolean {
  const tokens = getTokens();
  if (!tokens) return true;
  // Consider expired 60s before actual expiry to avoid edge cases
  return Date.now() / 1000 >= tokens.expiresAt - 60;
}

// ─── Auth context ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ─── AuthProvider ─────────────────────────────────────────────────────────────

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current user profile
  const fetchMe = useCallback(async (): Promise<void> => {
    const tokens = getTokens();
    if (!tokens) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });

      if (res.ok) {
        const data = (await res.json()) as { user: UserProfile };
        setUser(data.user);
      } else if (res.status === 401 && tokens.refreshToken) {
        // Try refresh
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as {
            tokens: AuthToken;
          };
          setTokens(refreshData.tokens);
          // Retry fetch
          const retryRes = await fetch(`${API_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${refreshData.tokens.accessToken}`,
            },
          });
          if (retryRes.ok) {
            const retryData = (await retryRes.json()) as { user: UserProfile };
            setUser(retryData.user);
          }
        } else {
          clearTokens();
          setUser(null);
        }
      } else {
        clearTokens();
        setUser(null);
      }
    } catch {
      // Network error — keep tokens but mark as not loaded
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (credentials: LoginRequest): Promise<void> => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? "Login failed");
    }

    const data = (await res.json()) as LoginResponse;
    setTokens(data.tokens);
    setUser(data.user);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const tokens = getTokens();
    if (tokens?.refreshToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      } catch {
        // Best effort
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
      refreshUser: fetchMe,
    }),
    [user, isLoading, login, logout, fetchMe]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}
