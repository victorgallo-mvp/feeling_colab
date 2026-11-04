import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, ChipTag, Empty, Modal, Spinner } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { PhotoPicker } from './PhotoPicker';

export function UserProfileModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { me } = useAuth();
  const q = useQuery<any>({ queryKey: ['profile', userId], queryFn: () => api(`/users/${userId}/profile`), enabled: !!userId });
  const p = q.data;
  const isMe = !!me && me.user.id === userId;
  return (
    <Modal open={!!userId} onClose={onClose} title={p ? (isMe ? 'Meu perfil' : p.user.name) : 'Perfil'} wide>
      {!p ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div className="space-y-3 sm:w-56">
            {isMe ? <PhotoPicker name={p.user.name} currentUrl={me!.user.avatar_url} endpoint="/me/avatar" size={96} />
              : <div className="flex items-center gap-3"><Avatar name={p.user.name} src={p.user.avatar_url} size={96} className="ring-2 ring-line" /><div><div className="font-medium">{p.user.name}</div><div className="text-xs text-fg-muted">{p.user.area_name ?? '—'}</div></div></div>}
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <Stat v={p.totals.points_received} l="pts recebidos" />
              <Stat v={p.totals.received} l="reconhecimentos" />
              <Stat v={p.totals.given} l="deu a colegas" />
              <Stat v={p.totals.missions} l="missões" />
              <Stat v={p.streak > 0 ? `🔥 ${p.streak}` : '—'} l="semanas seguidas" />
              <Stat v={p.totals.best_rank ? `${p.totals.best_rank}º` : '—'} l="melhor posição" />
            </div>
            {p.seasons.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-muted">Temporadas</div>
                <ul className="space-y-1 text-xs">{p.seasons.map((s: any) => <li key={s.id} className="flex justify-between"><span className="truncate">{s.name}</span><span className="tabular-nums text-fg-muted">{s.rank}º · {s.points_total} pts</span></li>)}</ul>
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-4">
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Conquistas</div>
              <div className="flex flex-wrap gap-1.5">
                {p.achievements.map((a: any) => (
                  <span key={a.key} title={`${a.description}${a.earned_at ? ` · ${timeAgo(a.earned_at)}` : ' · ainda não'}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${a.earned_at ? 'border-brand/40 bg-brand-soft text-fg' : 'border-line text-fg-faint grayscale'}`}>
                    <span>{a.emoji}</span>{a.label}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Pelo que é reconhecido</div>
              {p.by_chip.length === 0 ? <p className="text-sm text-fg-muted">Ainda sem reconhecimentos.</p> : (
                <div className="flex flex-wrap gap-1.5">{p.by_chip.map((c: any) => <ChipTag key={c.id} emoji={c.emoji} label={`${c.label} ×${c.count}`} color={c.color} size="md" />)}</div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Últimos reconhecimentos recebidos</div>
              {p.recent.length === 0 ? <Empty>Nada por aqui ainda.</Empty> : (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {p.recent.map((r: any) => (
                    <li key={r.id} className="rounded-xl border border-line p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Avatar name={r.giver_name} src={r.giver_avatar} size={22} /><b>{r.giver_name}</b> <ChipTag emoji={r.chip.emoji} label={r.chip.label} color={r.chip.color} /></span><span className="text-xs text-fg-faint">{timeAgo(r.created_at)}</span></div>
                      {r.message && <p className="mt-1 text-fg-2">“{r.message}”</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
const Stat = ({ v, l }: { v: any; l: string }) => <div className="rounded-xl bg-card-2 p-2"><div className="font-display text-lg font-semibold">{v}</div><div className="text-xs text-fg-muted">{l}</div></div>;
