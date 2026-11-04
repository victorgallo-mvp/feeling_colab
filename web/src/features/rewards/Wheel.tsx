import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Home } from '../../api/hooks';
import { Avatar, Button, Section } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { firstName } from '../../lib/format';

const SEGMENT_COLORS = ['var(--brand)', 'var(--card-2)'];

/** Roleta visual: conic-gradient por prêmio; o servidor decide o resultado e o ponteiro anima até ele. */
function WheelGraphic({ prizes, targetIndex, spinning, onDone }: { prizes: { id: string; title: string }[]; targetIndex: number | null; spinning: boolean; onDone: () => void }) {
  const n = Math.max(prizes.length, 1);
  const seg = 360 / n;
  const [angle, setAngle] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (targetIndex !== null && !spinning) { setAngle(360 - (targetIndex * seg + seg / 2)); return; }
    if (targetIndex === null || !spinning) return;
    // ponteiro fixo no topo (0°): gira até o centro do segmento escolhido ficar sob ele, com 5 voltas extras
    const center = targetIndex * seg + seg / 2;
    const final = 360 * 5 + (360 - center);
    setAngle((a) => a - (a % 360) + final);
    const t = setTimeout(onDone, 4300);
    return () => clearTimeout(t);
  }, [targetIndex, spinning, seg, onDone]);
  useEffect(() => { first.current = false; }, []);
  const stops = prizes.map((_, i) => `${SEGMENT_COLORS[i % 2]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
  return (
    <div className="relative mx-auto h-56 w-56">
      <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-fg" aria-hidden />
      <div className="h-full w-full rounded-full border-4 border-line shadow-inner" style={{ background: `conic-gradient(${stops})`, transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4.2s cubic-bezier(0.12, 0.8, 0.1, 1)' : 'none' }}>
        {prizes.map((p, i) => (
          <div key={p.id} className="absolute left-1/2 top-1/2 origin-left text-[10px] font-semibold leading-tight" style={{ transform: `rotate(${i * seg + seg / 2 - 90}deg) translateX(34px)`, width: 72, color: i % 2 === 0 ? 'var(--brand-fg)' : 'var(--fg)' }}>
            <span className="block truncate">{p.title}</span>
          </div>
        ))}
      </div>
      <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-line bg-card" aria-hidden />
    </div>
  );
}

export function WheelCard({ data, meId, focus }: { data: Home; meId: string; focus?: boolean }) {
  const w = data.wheel;
  const qc = useQueryClient();
  const toast = useToast();
  const [result, setResult] = useState<{ index: number; title: string } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const spin = useMutation({
    mutationFn: () => api<{ index: number; reward: { title: string } }>('/wheel/spin', { method: 'POST' }),
    onSuccess: (r) => { setResult({ index: r.index, title: r.reward.title }); setSpinning(true); },
    onError: (e: any) => toast(e?.message ?? 'Não deu pra girar', 'err'),
  });
  const done = () => { setSpinning(false); setRevealed(true); qc.invalidateQueries({ queryKey: ['home'] }); };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [focus]);

  if (!w.winner && w.prizes.length === 0) return null;
  const isMe = w.winner?.user_id === meId;
  return (
    <div ref={ref}>
      <Section id="wheel" title="Roleta da semana" subtitle="Quem mais recebeu pontos na semana anterior gira uma vez. Prêmios definidos pelo CEO.">
        {!w.winner && <p className="text-sm text-fg-muted">Ninguém pontuou na semana passada. Reconheça alguém e a roleta volta na segunda.</p>}
        {w.winner && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-card-2 p-3">
            <Avatar name={w.winner.name} src={w.winner.avatar_url} size={40} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{isMe ? 'Você' : w.winner.name} {isMe ? 'ganhou' : 'ganhou'} a semana 🎉</div>
              <div className="text-xs text-fg-muted">{w.winner.points} pontos recebidos na semana passada</div>
            </div>
            {w.spin && <div className="text-right text-sm"><div className="text-xs text-fg-muted">girou e levou</div><div className="font-semibold">{w.spin.reward_title}</div></div>}
          </div>
        )}
        {revealed && result && (
          <div className="space-y-3"><WheelGraphic prizes={w.prizes} targetIndex={result.index} spinning={false} onDone={() => {}} /><p className="text-center text-sm">🎁 Você levou <b>{result.title}</b>! Combine a entrega com o CEO.</p></div>
        )}
        {!revealed && w.winner && !w.spin && w.prizes.length > 0 && (
          <div className="space-y-3">
            <WheelGraphic prizes={w.prizes} targetIndex={result?.index ?? null} spinning={spinning} onDone={done} />
            {isMe ? (
              <Button className="w-full" size="lg" onClick={() => spin.mutate()} loading={spin.isPending || spinning}>{spinning ? 'Girando…' : 'Girar a roleta'}</Button>
            ) : <p className="text-center text-xs text-fg-muted">{firstName(w.winner.name)} ainda não girou. Prêmios possíveis: {w.prizes.map((p) => p.title).join(' · ')}</p>}
          </div>
        )}
        {w.winner && !w.spin && w.prizes.length === 0 && <p className="text-sm text-fg-muted">O CEO ainda não cadastrou prêmios na roleta.</p>}
      </Section>
    </div>
  );
}

export function RewardsCard({ data }: { data: Home }) {
  const ind = data.rewards.filter((r) => r.kind === 'individual');
  const team = data.rewards.filter((r) => r.kind === 'team');
  if (!ind.length && !team.length) return null;
  return (
    <Section title="O que está em jogo" subtitle={`Definido pelo CEO para a ${data.cycle.name.toLowerCase()}.`}>
      <ul className="space-y-2 text-sm">
        {ind.map((r) => <li key={r.id} className="flex gap-2"><span>🏆</span><span><b>{r.title}</b>{r.description && <span className="text-fg-muted"> · {r.description}</span>}</span></li>)}
        {team.map((r) => <li key={r.id} className="flex gap-2"><span>🤝</span><span><b>{r.title}</b>{r.description && <span className="text-fg-muted"> · {r.description}</span>} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${data.team.reached ? 'bg-success-soft text-success-fg' : 'bg-card-2 text-fg-muted'}`}>meta do time {Math.round(data.team.pct)}% / {data.cycle.goal.pct}%</span></span></li>)}
      </ul>
    </Section>
  );
}
