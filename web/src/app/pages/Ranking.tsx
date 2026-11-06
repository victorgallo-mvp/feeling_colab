import { useState } from 'react';
import { useHome } from '../../api/hooks';
import { useAuth } from '../../lib/auth';
import { Avatar, Spinner } from '../../components/ui';
import { firstName } from '../../lib/format';
import { WeekWheel } from '../../features/wheel/Wheel';
import { UserProfileModal } from '../../features/profile/UserProfileModal';

/** Painel visível para todos: ranking da temporada (moedas recebidas) e a roleta da semana. */
export function RankingPage() {
  const { me } = useAuth();
  const home = useHome();
  const [profileId, setProfileId] = useState<string | null>(null);
  if (home.isLoading || !me) return <div className="flex justify-center py-24 text-fg-faint"><Spinner className="h-6 w-6" /></div>;
  if (home.isError || !home.data) return <div className="py-16 text-center text-sm text-fg-2">Não consegui carregar. <button className="underline" onClick={() => home.refetch()}>Tentar de novo</button></div>;
  const d = home.data;
  const meId = me.user.id;
  return (
    <div className="space-y-14">
      <section aria-labelledby="ranking-title">
        <h1 id="ranking-title" className="font-display text-4xl leading-none text-fg sm:text-5xl">Ranking</h1>
        <p className="mt-3 text-base text-fg-muted">{d.cycle.name}. Conta só o que os colegas deram.{d.me.rank ? ` Você está em ${d.me.rank}º.` : ''}</p>
        <ol className="mt-8 divide-y divide-line">
          {d.ranking.map((r) => {
            const mine = r.user_id === meId;
            return (
              <li key={r.user_id}>
                <button onClick={() => setProfileId(r.user_id)} className={`focus-ring flex w-full items-center gap-4 py-3 text-left ${mine ? 'text-fg' : 'text-fg-2'}`}>
                  <span className={`w-8 font-display text-2xl leading-none tabular-nums ${r.rank <= 3 ? 'text-brand-text' : 'text-fg-faint'}`}>{r.rank}</span>
                  <Avatar name={r.name} src={r.avatar_url} size={40} />
                  <span className="min-w-0 flex-1 truncate text-base">{mine ? 'Você' : firstName(r.name)}</span>
                  <span className="font-display text-2xl leading-none tabular-nums text-fg">{r.points_total}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {d.ranking.every((r) => r.points_total === 0) && <p className="mt-4 text-sm text-fg-muted">Ninguém recebeu moeda ainda nesta temporada.</p>}
      </section>
      <WeekWheel wheel={d.wheel} meId={meId} />
      <UserProfileModal userId={profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
