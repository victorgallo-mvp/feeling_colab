import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { clearTokens, getTokens } from './tokens';
import { applyTheme } from './theme';

export interface Me {
  user: { id: string; name: string; email: string; avatar_url: string | null; role: 'member' | 'manager' | 'admin'; area: { id: string; name: string } | null };
  tenant: { id: string; slug: string; name: string; logo_url: string | null; logo_dark_url: string | null; symbol_url: string | null; theme: 'light' | 'dark' | 'duo'; font_display: 'default' | 'big-shoulders'; auth_mode: 'magic_link' | 'click'; primary_color: string; secondary_color: string; timezone: string };
  push: { vapidPublicKey: string | null };
}

interface Ctx { me: Me | null; loading: boolean; authed: boolean; logout: () => Promise<void>; refetch: () => void }
const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(!!getTokens());
  const q = useQuery<Me>({ queryKey: ['me'], queryFn: () => api('/me'), enabled: authed, staleTime: 5 * 60_000, retry: false });

  useEffect(() => { if (q.data) applyTheme(q.data.tenant); }, [q.data]);
  useEffect(() => {
    const onLogout = () => { clearTokens(); setAuthed(false); qc.clear(); };
    const onLogin = () => setAuthed(true);
    window.addEventListener('auth:logout', onLogout);
    window.addEventListener('auth:login', onLogin);
    return () => { window.removeEventListener('auth:logout', onLogout); window.removeEventListener('auth:login', onLogin); };
  }, [qc]);

  const logout = useCallback(async () => {
    const t = getTokens();
    if (t?.refreshToken) await api('/auth/logout', { method: 'POST', json: { refreshToken: t.refreshToken } }).catch(() => {});
    window.dispatchEvent(new Event('auth:logout'));
  }, []);

  const value = useMemo<Ctx>(() => ({ me: q.data ?? null, loading: authed && q.isLoading, authed, logout, refetch: () => q.refetch() }), [q.data, q.isLoading, authed, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
