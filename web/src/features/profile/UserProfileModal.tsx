import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, Button, Modal, Spinner } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { PhotoPicker } from './PhotoPicker';
import { enablePush, pushSupported } from '../../lib/push';

/** Perfil enxuto: foto, moedas recebidas e dadas, últimas recebidas. No meu, também avisos. */
export function UserProfileModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { me } = useAuth();
  const q = useQuery<any>({ queryKey: ['profile', userId], queryFn: () => api(`/users/${userId}/profile`), enabled: !!userId });
  const p = q.data;
  const isMe = !!me && me.user.id === userId;
  return (
    <Modal open={!!userId} onClose={onClose} title={p ? (isMe ? 'Você' : p.user.name) : ''}>
      {!p ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {isMe ? <PhotoPicker name={p.user.name} currentUrl={me!.user.avatar_url} endpoint="/me/avatar" size={80} />
              : <Avatar name={p.user.name} src={p.user.avatar_url} size={80} />}
            <div className="grid grid-cols-2 gap-x-8 text-center">
              <div><div className="font-display text-3xl leading-none">{p.totals.received}</div><div className="mt-1 text-xs text-fg-muted">recebidas</div></div>
              <div><div className="font-display text-3xl leading-none">{p.totals.given}</div><div className="mt-1 text-xs text-fg-muted">dadas</div></div>
            </div>
          </div>
          {isMe && <PushToggle vapid={me!.push.vapidPublicKey} />}
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Últimas recebidas</div>
            {p.recent.length === 0 ? <p className="text-sm text-fg-muted">Nenhuma ainda.</p> : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {p.recent.map((r: any) => (
                  <li key={r.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><Avatar name={r.giver_name} src={r.giver_avatar} size={22} /><b>{r.giver_name}</b>{r.chip && <span className="text-fg-muted">· {r.chip.label}</span>}</span>
                      <span className="text-xs text-fg-faint">{timeAgo(r.created_at)}</span>
                    </div>
                    {r.message && <p className="mt-1 text-fg-2">“{r.message}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function PushToggle({ vapid }: { vapid: string | null }) {
  const [state, setState] = useState<'hidden' | 'off' | 'on' | 'denied'>('hidden');
  useEffect(() => {
    if (!vapid || !pushSupported()) return setState('hidden');
    setState(Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off');
  }, [vapid]);
  if (state === 'hidden') return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
      <span className="text-fg-2">Aviso quando você receber uma moeda</span>
      {state === 'on' ? <span className="text-xs text-fg-muted">ativado</span>
        : state === 'denied' ? <span className="text-xs text-fg-muted">bloqueado no navegador</span>
        : <Button size="sm" variant="soft" onClick={async () => { try { setState((await enablePush(vapid!)) ? 'on' : 'denied'); } catch { setState('denied'); } }}>Ativar</Button>}
    </div>
  );
}
