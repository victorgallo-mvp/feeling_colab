import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, inputCls } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, ChipTag, Empty, Modal, Section, Spinner } from '../../components/ui';
import { fmtDate, timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';

export function SeasonsListPage() {
  const q = useQuery<any[]>({ queryKey: ['cycles'], queryFn: () => api('/cycles') });
  if (q.isLoading) return <Spinner />;
  return (
    <Section title="Temporadas" subtitle="O placar zera a cada temporada. O histórico fica aqui.">
      <ul className="divide-y divide-line">
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link to={`/temporadas/${c.id}`} className="focus-ring flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-card-2">
              <div><div className="font-medium">{c.name} {c.status === 'open' && <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success-fg">em andamento</span>}</div>
                <div className="text-xs text-fg-muted">{fmtDate(c.starts_at)} – {fmtDate(c.ends_at)}{c.status === 'closed' && <> · participação {Math.round(c.participation_pct ?? 0)}% · {c.team_goal_reached ? 'meta do time batida 🎉' : 'meta do time não batida'}</>}</div></div>
              <span className="text-fg-faint">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function SeasonPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const q = useQuery<any>({ queryKey: ['cycle', id], queryFn: () => api(`/cycles/${id}/summary`), enabled: !!id });
  const [open, setOpen] = useState<any>(null);
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!q.data) return <Empty>Temporada não encontrada.</Empty>;
  const { cycle, ranking, participation, recognitions_by_user } = q.data;
  const isAdmin = me?.user.role === 'admin';
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/temporadas" className="text-xs text-fg-muted hover:underline">← todas as temporadas</Link>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{cycle.name}</h1>
            <p className="text-sm text-fg-muted">{fmtDate(cycle.starts_at)} – {fmtDate(cycle.ends_at)} · {cycle.status === 'open' ? 'em andamento' : `encerrada ${timeAgo(cycle.closed_at)}`}</p>
          </div>
          <div className="text-right text-sm">
            <div className={`font-semibold ${participation.reached ? 'text-success-fg' : 'text-fg-2'}`}>{participation.reached ? '🎉 Meta coletiva batida' : 'Meta coletiva'}: {Math.round(participation.pct)}% <span className="font-normal text-fg-muted">(meta {cycle.goal_participation_pct}%)</span></div>
            <div className="text-xs text-fg-muted">{participation.met} de {participation.total} deram ≥{cycle.goal_min_recognitions} reconhecimentos e concluíram ≥{cycle.goal_min_missions} missão</div>
            {cycle.team_reward_note && <div className="mt-1 text-xs">🏆 Prêmio do time: <b>{cycle.team_reward_note}</b></div>}
          </div>
        </div>
      </div>
      <Section title="Ranking" subtitle="Clique em alguém pra ver os reconhecimentos que recebeu.">
        <ol className="divide-y divide-line">
          {ranking.map((r: any) => (
            <li key={r.user_id}>
              <button onClick={() => setOpen(r)} className="focus-ring flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-card-2">
                <span className={`w-7 text-center text-sm font-semibold tabular-nums ${r.rank <= 3 ? 'text-brand-text' : 'text-fg-faint'}`}>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
                <Avatar name={r.name} src={r.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">{r.name} {r.user_id === me?.user.id && <span className="text-xs font-normal text-fg-faint">(você)</span>}{r.met_participation && <span title="Participou da meta coletiva" className="text-xs">✅</span>}</div>
                  <div className="truncate text-xs text-fg-muted">{r.area_name ?? '—'} · {r.recognitions_received} recebidos · {r.missions_completed} missões · deu {r.recognitions_given}{isAdmin && r.individual_reward_note ? <> · 🏆 {r.individual_reward_note}</> : null}</div>
                </div>
                <div className="flex gap-1">{(r.received_by_chip_detail ?? []).slice(0, 3).map((d: any) => d.chip && <span key={d.chip.id} title={`${d.chip.label}: ${d.count}`} className="text-base">{d.chip.emoji}</span>)}</div>
                <div className="w-16 text-right text-base font-semibold tabular-nums">{r.points_total} <span className="text-xs font-normal text-fg-faint">pts</span></div>
              </button>
            </li>
          ))}
        </ol>
      </Section>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} · ${open.points_total} pts` : ''}>
        {open && <>
          <PersonDetail r={open} recs={recognitions_by_user[open.user_id] ?? []} />
          {isAdmin && cycle.status === 'closed' && <RewardNote cycleId={cycle.id} userId={open.user_id} initial={open.individual_reward_note ?? ''} />}
        </>}
      </Modal>
    </div>
  );
}

function RewardNote({ cycleId, userId, initial }: { cycleId: string; userId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api(`/cycles/${cycleId}/rewards/${userId}`, { method: 'PATCH', json: { note: note || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cycle', cycleId] }); toast('Prêmio registrado'); },
    onError: (e: any) => toast(e?.message, 'err'),
  });
  return (
    <form className="mt-4 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-muted">🏆 Prêmio individual (só você vê; o prêmio em si é combinado fora do app)</label>
      <div className="flex gap-2"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: vale-presente R$ 200" maxLength={500} /><Button type="submit" loading={save.isPending}>Salvar</Button></div>
    </form>
  );
}

export function PersonDetail({ r, recs }: { r: any; recs: any[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{(r.received_by_chip_detail ?? []).map((d: any) => d.chip && <ChipTag key={d.chip.id} emoji={d.chip.emoji} label={`${d.chip.label} ×${d.count}`} color={d.chip.color} size="md" />)}</div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-surface p-2"><div className="text-lg font-semibold">{r.points_recognition}</div><div className="text-xs text-fg-muted">pts de colegas</div></div>
        <div className="rounded-xl bg-surface p-2"><div className="text-lg font-semibold">{r.points_missions}</div><div className="text-xs text-fg-muted">pts de missões</div></div>
        <div className="rounded-xl bg-surface p-2"><div className="text-lg font-semibold">{r.recognitions_given}</div><div className="text-xs text-fg-muted">deu a colegas</div></div>
      </div>
      {recs.length === 0 ? <Empty>Não recebeu reconhecimentos nesta temporada.</Empty> : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {recs.map((x: any) => (
            <li key={x.id} className="rounded-xl border border-line p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2"><span><b>{x.giver_name}</b> {x.chip && <ChipTag emoji={x.chip.emoji} label={x.chip.label} color={x.chip.color} />}</span><span className="text-xs text-fg-faint">{timeAgo(x.created_at)}</span></div>
              {x.message && <p className="mt-1 text-fg-2">“{x.message}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
