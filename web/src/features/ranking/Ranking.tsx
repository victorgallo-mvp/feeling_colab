import { useState } from 'react';
import type { Home } from '../../api/hooks';
import { Avatar, Section } from '../../components/ui';
import { firstName } from '../../lib/format';

export function Ranking({ data, meId, onOpenProfile }: { data: Home; meId: string; onOpenProfile: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const list = data.ranking;
  const myIdx = list.findIndex((r) => r.user_id === meId);
  const top = all ? list : list.slice(0, 5);
  const showMeExtra = !all && myIdx >= 5;
  const Row = ({ r }: { r: Home['ranking'][number] }) => {
    const mine = r.user_id === meId;
    return (
      <li>
        <button onClick={() => onOpenProfile(r.user_id)} className={`focus-ring flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-card-2 ${mine ? 'bg-brand-soft' : ''}`}>
          <span className={`w-6 text-center text-sm font-semibold tabular-nums ${r.rank <= 3 ? 'text-brand-text' : 'text-fg-faint'}`}>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
          <Avatar name={r.name} src={r.avatar_url} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{mine ? 'Você' : firstName(r.name)} {r.streak >= 2 && <span className="text-xs font-normal text-fg-muted" title={`${r.streak} semanas seguidas reconhecendo`}>🔥{r.streak}</span>}</span>
            <span className="block truncate text-xs text-fg-muted">{r.recognitions_received} recebidos · {r.missions_completed} {r.missions_completed === 1 ? 'missão' : 'missões'}</span>
          </span>
          <span className="font-display text-base font-semibold tabular-nums">{r.points_total}</span>
        </button>
      </li>
    );
  };
  return (
    <Section id="ranking" title="Classificação" subtitle={data.me.rank ? `Você está em ${data.me.rank}º de ${list.length}. Pontos vêm só dos colegas e das missões validadas.` : 'Pontos vêm só dos colegas e das missões validadas.'}
      action={list.length > 5 ? <button onClick={() => setAll(!all)} className="focus-ring whitespace-nowrap rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-card-2">{all ? 'ver menos' : `ver todos (${list.length})`}</button> : undefined}>
      <ol className="space-y-0.5">
        {top.map((r) => <Row key={r.user_id} r={r} />)}
        {showMeExtra && <><li className="px-3 py-0.5 text-center text-xs text-fg-faint">···</li><Row r={list[myIdx]} /></>}
      </ol>
    </Section>
  );
}
