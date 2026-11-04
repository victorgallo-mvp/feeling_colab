import { useState } from 'react';
import type { Home, QueueItem } from '../../api/hooks';
import { useReview } from '../../api/hooks';
import { Avatar, Button, Section } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { firstName, timeAgo } from '../../lib/format';

export function ValidationQueue({ data }: { data: Home }) {
  const review = useReview();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  const [note, setNote] = useState('');
  if (data.queue.length === 0) return null;

  async function act(item: QueueItem, approve: boolean, n?: string) {
    try {
      await review.mutateAsync({ id: item.id, approve, note: n });
      toast(approve ? <span>✅ <b>{firstName(item.user_name)}</b> ganhou +{item.points} pts</span> : <span>Missão de {firstName(item.user_name)} recusada</span>, approve ? 'ok' : 'info');
      setRejecting(null); setNote('');
    } catch (e: any) { toast(e?.message ?? 'Erro ao validar', 'err'); }
  }

  return (
    <Section id="queue" title={<span className="flex items-center gap-2">Validar missões <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn-fg">{data.queue.length}</span></span>} subtitle="Pontos só entram depois do seu ok." className="border-warn/30 bg-warn-soft/40">
      <ul className="divide-y divide-line">
        {data.queue.map((q) => (
          <li key={q.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <Avatar name={q.user_name} src={q.user_avatar} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm"><b>{q.user_name}</b> concluiu <b>{q.title}</b></div>
                <div className="text-xs text-fg-muted">+{q.points} pts · {timeAgo(q.completed_at)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" onClick={() => act(q, true)} loading={review.isPending && review.variables?.id === q.id && review.variables.approve}>Aprovar</Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejecting(rejecting?.id === q.id ? null : q); setNote(''); }}>Recusar</Button>
              </div>
            </div>
            {rejecting?.id === q.id && (
              <form className="mt-2 flex gap-2 pl-12" onSubmit={(e) => { e.preventDefault(); act(q, false, note); }}>
                <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Motivo (opcional, a pessoa vai ver)" className="focus-ring h-9 flex-1 rounded-xl border border-line bg-card px-3 text-sm" />
                <Button type="submit" size="sm" variant="danger" loading={review.isPending && review.variables?.id === q.id && !review.variables.approve}>Confirmar recusa</Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
