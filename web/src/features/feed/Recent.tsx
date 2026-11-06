import type { Home } from '../../api/hooks';
import { Avatar } from '../../components/ui';
import { firstName, timeAgo } from '../../lib/format';

/** Lista discreta das últimas moedas da temporada. Só leitura. */
export function Recent({ data, meId, highlightId, onOpenProfile }: { data: Home; meId: string; highlightId?: string | null; onOpenProfile?: (id: string) => void }) {
  const Name = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <button type="button" onClick={() => onOpenProfile?.(id)} className="focus-ring rounded font-semibold text-fg hover:underline">{children}</button>
  );
  if (data.feed.length === 0) return null;
  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title" className="font-display text-xl leading-none text-fg-muted">Últimas</h2>
      <ul className="mt-4 divide-y divide-line">
        {data.feed.slice(0, 20).map((f) => {
          const mine = f.receiver_id === meId;
          return (
            <li key={f.id} id={`rec-${f.id}`} className={`flex gap-3 py-3 ${highlightId === f.id ? 'flash' : ''}`}>
              <Avatar name={f.giver_name} src={f.giver_avatar} size={32} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug text-fg-2">
                  <Name id={f.giver_id}>{f.giver_id === meId ? 'Você' : firstName(f.giver_name)}</Name>
                  {' deu uma moeda para '}
                  <Name id={f.receiver_id}>{mine ? 'você' : firstName(f.receiver_name)}</Name>
                  {f.chip && <span className="text-fg-muted"> · {f.chip.label}</span>}
                </div>
                {f.message && <p className="mt-1 text-sm text-fg">“{f.message}”</p>}
              </div>
              <span className="shrink-0 text-xs text-fg-faint">{timeAgo(f.created_at)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
