const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
  if (diff < 86400 * 7) return rtf.format(-Math.floor(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
export const firstName = (name: string) => name.split(/\s+/)[0];
