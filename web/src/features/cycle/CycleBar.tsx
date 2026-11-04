import type { Home } from '../../api/hooks';
import { Progress } from '../../components/ui';
import { endsLabel } from '../../lib/format';

export function CycleBar({ data }: { data: Home }) {
  const { cycle, me, team } = data;
  const canGive = Math.floor(me.balance / cycle.recognition_cost);
  return (
    <div className="ink card grid grid-cols-2 gap-4 p-4 sm:p-5 lg:grid-cols-4">
      <Stat label={cycle.name} value={`${cycle.progress_pct}%`} hint={endsLabel(cycle.ends_at)}>
        <Progress value={cycle.progress_pct} color="#a8a29e" className="mt-2" />
      </Stat>
      <Stat label="Moedas pra distribuir" value={me.balance} hint={me.balance > 0 ? `dá pra ${canGive} reconhecimento${canGive === 1 ? '' : 's'} · use ou perca` : 'você usou tudo 🙌'} accent>
        <Progress value={(me.balance / cycle.coins_per_user) * 100} color="var(--brand)" className="mt-2" />
      </Stat>
      <Stat label={me.rank ? `Meus pontos · ${me.rank}º lugar` : 'Meus pontos'} value={me.points_total} hint={`${me.recognitions_received} reconhecimento${me.recognitions_received === 1 ? '' : 's'} · ${me.missions_completed} ${me.missions_completed === 1 ? 'missão' : 'missões'}${me.streak >= 2 ? ` · 🔥 ${me.streak} semanas seguidas` : ''}`} />
      <Stat label="Meta do time" value={`${Math.round(team.pct)}%`} hint={team.reached ? 'meta batida 🎉' : `${team.met} de ${team.total} participando · meta ${cycle.goal.pct}%`}>
        <Progress value={(team.pct / cycle.goal.pct) * 100} color={team.reached ? 'var(--success)' : 'var(--fg-faint)'} className="mt-2" />
      </Stat>
    </div>
  );
}

function Stat({ label, value, hint, children, accent }: { label: string; value: string | number; hint?: string; children?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</div>
      <div className={`font-display mt-0.5 text-2xl font-semibold tabular-nums tracking-tight ${accent ? 'text-brand-text' : ''}`}>{value}</div>
      {hint && <div className="truncate text-xs text-fg-muted">{hint}</div>}
      {children}
    </div>
  );
}
