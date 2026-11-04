const KEY = 'rec.tokens';
export interface Tokens { accessToken: string; refreshToken: string }
export function getTokens(): Tokens | null { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } }
export function setTokens(t: Tokens) { localStorage.setItem(KEY, JSON.stringify(t)); }
export function clearTokens() { localStorage.removeItem(KEY); }
