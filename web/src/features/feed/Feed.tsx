import type { Home } from '../../api/hooks';
import { useClap } from '../../api/hooks';
import { Avatar, ChipTag, Empty, Section } from '../../components/ui';
import { firstName, timeAgo } from '../../lib/format';

export function Feed({ data, meId, highlightId, onOpenProfile }: { data: Home; meId: string; highlightId?: string | null; onOpenProfile?: (id: string) => void }) {
  const P = ({ id, children }: { id: string; children: React.ReactNode }) => <button type="button" onClick={() => onOpenProfile?.(id)} className="focus-ring rounded font-semibold hover:underline">{children}</button>;
  const clap = useClap();
  return (
    <Section id="feed" title="Últimos reconhecimentos" subtitle="👏 é só carinho, não vale ponto.">
      {data.feed.length === 0 && <Empty>Ainda não teve reconhecimento nesta temporada. Seja a primeira pessoa! 🙌</Empty>}
      <ul className="space-y-3">
        {data.feed.map((f) => {
          const mine = f.receiver_id === meId;
          return (
            <li key={f.id} id={`rec-${f.id}`} className={`rounded-2xl border p-3 transition ${mine ? 'border-brand/30 bg-brand-soft/40' : 'border-line bg-card-2/60'} ${highlightId === f.id ? 'flash' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <Avatar name={f.giver_name} src={f.giver_avatar} size={36} />
                  <Avatar name={f.receiver_name} src={f.receiver_avatar} size={24} className="absolute -bottom-1 -right-2 ring-2 ring-card" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug">
                    <P id={f.giver_id}>{f.giver_id === meId ? 'Você' : firstName(f.giver_name)}</P> <span className="text-fg-muted">→</span> <P id={f.receiver_id}>{mine ? 'você' : firstName(f.receiver_name)}</P>
                    <span className="ml-1.5 inline-block align-middle"><ChipTag emoji={f.chip.emoji} label={f.chip.label} color={f.chip.color} /></span>
                  </div>
                  {f.message && <p className="mt-1 text-sm text-fg-2">“{f.message}”</p>}
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-fg-muted">
                    <span>{timeAgo(f.created_at)}</span>
                    <button onClick={() => clap.mutate(f.id)} aria-pressed={f.clapped}
                      className={`focus-ring inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition ${f.clapped ? 'bg-warn-soft text-warn-fg' : 'hover:bg-card-2'}`}>
                      <span className={f.clapped ? 'animate-pop inline-block' : 'inline-block'}>👏</span>{f.claps > 0 && <span className="tabular-nums">{f.claps}</span>}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
