import { useState } from 'react';
import { useHome } from '../../api/hooks';
import { useAuth } from '../../lib/auth';
import { Avatar, Spinner } from '../../components/ui';
import { firstName } from '../../lib/format';
import { WeekWheel } from '../../features/wheel/Wheel';
import { UserProfileModal } from '../../features/profile/UserProfileModal';

const day = (iso: string, offsetDays = 0) => new Date(new Date(iso).getTime() + offsetDays * 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Painel visível para todos: ranking da semana corrente (moedas recebidas) e a roleta do Destaque da semana anterior. */
export function RankingPage() {
  const { me } = useAuth();
  const home = useHome();
  const [profileId, setProfileId] = useState<string | null>(null);
  if (home.isLoading || !me) return <div className="flex justify-center py-24 text-fg-faint"><Spinner className="h-6 w-6" /></div>;
  if (home.isError || !home.data) return <div className="py-16 text-center text-sm text-fg-2">Não consegui carregar. <button className="underline" onClick={() => home.refetch()}>Tentar de novo</button></div>;
  const d = home.data;
  const meId = me.user.id;
  const rows = d.week.ranking.filter((r) => r.coins > 0);
  return (
    <div className="space-y-14">
      <section aria-labelledby="ranking-title">
        <h1 id="ranking-title" className="font-display text-4xl leading-none text-fg sm:text-5xl">Ranking da semana</h1>
        <p className="mt-3 text-base text-fg-muted">
          De {day(d.week.starts_at)} a {day(d.week.ends_at, -1)}. Quem receber mais moedas vira o Destaque da Semana e gira a roleta na segunda.
          {d.week.my_rank ? ` Você está em ${d.week.my_rank}º.` : ''}
        </p>
        {rows.length > 0 ? (
          <ol className="mt-8 divide-y divide-line">
            {rows.map((r) => {
              const mine = r.user_id === meId;
              return (
                <li key={r.user_id}>
                  <button onClick={() => setProfileId(r.user_id)} className={`focus-ring flex w-full items-center gap-4 py-3 text-left ${mine ? 'text-fg' : 'text-fg-2'}`}>
                    <span className={`w-8 font-display text-2xl leading-none tabular-nums ${r.rank <= 3 ? 'text-brand-text' : 'text-fg-faint'}`}>{r.rank}</span>
                    <Avatar name={r.name} src={r.avatar_url} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base">{mine ? 'Você' : firstName(r.name)}</span>
                      <span className="block text-xs text-fg-muted">de {r.givers} {r.givers === 1 ? 'colega' : 'colegas diferentes'}</span>
                    </span>
                    <span className="font-display text-2xl leading-none tabular-nums text-fg" aria-label={`${r.coins} ${r.coins === 1 ? 'moeda' : 'moedas'}`}>{r.coins}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : <p className="mt-8 text-sm text-fg-muted">Ninguém recebeu moeda ainda nesta semana.</p>}
        <p className="mt-4 text-xs text-fg-faint">Empate em moedas? Vence quem recebeu de mais colegas diferentes. O ranking considera o reconhecimento da semana, não uma avaliação de desempenho.</p>
      </section>
      <WeekWheel wheel={d.wheel} meId={meId} />
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
