import type { Home, Mission } from '../../api/hooks';
import { useCompleteMission } from '../../api/hooks';
import { Button, Empty, Section } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { dueLabel, recurrenceLabel } from '../../lib/format';
import { ApiError } from '../../api/client';

export function MissionList({ data, action, highlightId }: { data: Home; action?: React.ReactNode; highlightId?: string | null }) {
  const complete = useCompleteMission();
  const toast = useToast();
  async function done(m: Mission) {
    try { await complete.mutateAsync(m.id); toast(<span>📨 <b>{m.title}</b> enviada pra validação de {m.creator_name.split(' ')[0]}</span>); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Não foi possível concluir', 'err'); }
  }
  const open = data.missions.filter((m) => m.completion_status !== 'approved');
  const doneList = data.missions.filter((m) => m.completion_status === 'approved');
  return (
    <Section id="missions" title="Minhas missões" subtitle="Marque “Concluí” e o gestor valida. Pontos só entram depois da validação." action={action}>
      {data.missions.length === 0 && <Empty>Nenhuma missão ativa pra você agora.</Empty>}
      <ul className="divide-y divide-line">
        {[...open, ...doneList].map((m) => {
          const status = m.completion_status;
          const overdue = m.due_at && new Date(m.due_at) < new Date() && !status;
          return (
            <li key={m.id} id={`mission-${m.id}`} className={`flex items-center gap-3 py-3 first:pt-0 last:pb-0 ${highlightId === m.id ? 'flash rounded-xl' : ''}`}>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${status === 'approved' ? 'bg-success-soft text-success-fg' : status === 'pending' ? 'bg-warn-soft text-warn-fg' : 'bg-card-2 text-fg-2'}`} title="pontos">
                {status === 'approved' ? '✓' : `+${m.points}`}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-medium ${status === 'approved' ? 'text-fg-faint line-through' : 'text-fg'}`}>{m.title}</div>
                <div className="truncate text-xs text-fg-muted" title={m.description ?? undefined}>
                  <span className="capitalize">{recurrenceLabel[m.recurrence]}</span> · {m.points} pts · <span className={overdue ? 'text-danger' : ''}>{dueLabel(m.due_at)}</span>
                  {m.description && <span className="hidden sm:inline"> · {m.description}</span>}
                  {status === 'rejected' && <span className="text-danger"> · não validada{m.review_note ? `: ${m.review_note}` : ''}</span>}
                </div>
              </div>
              {status === 'approved' ? <span className="text-xs font-medium text-success-fg">+{m.points} creditados</span>
                : status === 'pending' ? <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn-fg">aguardando validação</span>
                : <Button size="sm" variant={status === 'rejected' ? 'soft' : 'primary'} onClick={() => done(m)} loading={complete.isPending && complete.variables === m.id}>{status === 'rejected' ? 'Reenviar' : 'Concluí'}</Button>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
