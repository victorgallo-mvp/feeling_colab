import { clearTokens, getTokens, setTokens } from '../lib/tokens';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const t = getTokens();
      if (!t?.refreshToken) return false;
      const r = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: t.refreshToken }) });
      if (!r.ok) { clearTokens(); return false; }
      setTokens(await r.json());
      return true;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const t = getTokens();
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  if (t?.accessToken) headers.authorization = `Bearer ${t.accessToken}`;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  if (res.status === 401 && retry && t?.refreshToken) {
    if (await tryRefresh()) return api<T>(path, init, false);
    window.dispatchEvent(new Event('auth:logout'));
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Erro inesperado', data?.code, data?.details);
  return data as T;
}
