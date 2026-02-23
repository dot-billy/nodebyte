"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getAccessToken, setAccessToken, type TeamPublic, type UserPublic } from "@/lib/api";

interface AuthState {
  user: UserPublic | null;
  teams: TeamPublic[] | null;
  activeTeam: TeamPublic | null;
  loading: boolean;
  setActiveTeam: (team: TeamPublic) => void;
  login: (email: string, password: string, opts?: { website?: string; cf_turnstile_token?: string }) => Promise<void>;
  register: (data: { email?: string; password: string; fullName?: string; teamName?: string; inviteToken?: string; website?: string; cf_turnstile_token?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadTeams: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [teams, setTeams] = useState<TeamPublic[] | null>(null);
  const [activeTeam, setActiveTeamState] = useState<TeamPublic | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const [u, t] = await Promise.all([api.auth.me(), api.teams.list()]);
      setUser(u);
      setTeams(t);
      if (t.length > 0) {
        setActiveTeamState((prev) => {
          if (prev) return prev;
          const stored = typeof window !== "undefined" ? localStorage.getItem("activeTeamId") : null;
          const match = stored ? t.find((tm) => tm.id === stored) : null;
          return match ?? t[0];
        });
      }
    } catch {
      setUser(null);
      setTeams(null);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      if (!getAccessToken()) {
        const res = await api.auth.refresh();
        setAccessToken(res.access_token);
      }
      await loadProfile();
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string, opts?: { website?: string; cf_turnstile_token?: string }) => {
    const res = await api.auth.login({ email, password, ...opts });
    setAccessToken(res.access_token);
    await loadProfile();
  }, [loadProfile]);

  const register = useCallback(async (data: { email?: string; password: string; fullName?: string; teamName?: string; inviteToken?: string; website?: string; cf_turnstile_token?: string }) => {
    const res = await api.auth.register({
      email: data.email || undefined,
      password: data.password,
      full_name: data.fullName || undefined,
      team_name: data.teamName || undefined,
      invite_token: data.inviteToken || undefined,
      website: data.website,
      cf_turnstile_token: data.cf_turnstile_token,
    });
    setAccessToken(res.access_token);
    await loadProfile();
  }, [loadProfile]);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    setTeams(null);
    setActiveTeamState(null);
    localStorage.removeItem("activeTeamId");
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.auth.refresh();
    setAccessToken(res.access_token);
  }, []);

  const setActiveTeam = useCallback((team: TeamPublic) => {
    setActiveTeamState(team);
    localStorage.setItem("activeTeamId", team.id);
  }, []);

  const reloadTeams = useCallback(async () => {
    const t = await api.teams.list();
    setTeams(t);
  }, []);

  const reloadProfile = useCallback(async () => {
    const u = await api.auth.me();
    setUser(u);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, teams, activeTeam, loading, setActiveTeam, login, register, logout, refresh, reloadTeams, reloadProfile }),
    [user, teams, activeTeam, loading, setActiveTeam, login, register, logout, refresh, reloadTeams, reloadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
