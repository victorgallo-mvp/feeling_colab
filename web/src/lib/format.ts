const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
  if (diff < 86400 * 7) return rtf.format(-Math.floor(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
export function dueLabel(iso: string | null) {
  if (!iso) return 'sem prazo';
  const d = new Date(iso); const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return 'vencida';
  if (days === 0) return 'até hoje';
  if (days === 1) return 'até amanhã';
  if (days <= 7) return `${days} dias`;
  return 'até ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
export function endsLabel(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'encerrando';
  if (days === 1) return 'termina amanhã';
  return `termina em ${days} dias`;
}
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
export const firstName = (name: string) => name.split(/\s+/)[0];
export const recurrenceLabel: Record<string, string> = { once: 'única', weekly: 'semanal', monthly: 'mensal' };
