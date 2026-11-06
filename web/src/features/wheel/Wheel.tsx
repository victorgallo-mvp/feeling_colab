import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Wheel as WheelData } from '../../api/hooks';
import { Avatar, Button } from '../../components/ui';
import { firstName } from '../../lib/format';

/** Roleta visual: um segmento por prêmio; o servidor sorteia e o ponteiro anima até o resultado. */
function WheelGraphic({ prizes, targetIndex, spinning, onDone }: { prizes: { id: string; title: string }[]; targetIndex: number | null; spinning: boolean; onDone: () => void }) {
  const n = Math.max(prizes.length, 1);
  const seg = 360 / n;
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    if (targetIndex !== null && !spinning) { setAngle(360 - (targetIndex * seg + seg / 2)); return; }
    if (targetIndex === null || !spinning) return;
    const center = targetIndex * seg + seg / 2;
    const final = 360 * 5 + (360 - center);
    setAngle((a) => a - (a % 360) + final);
    const t = setTimeout(onDone, 4300);
    return () => clearTimeout(t);
  }, [targetIndex, spinning, seg, onDone]);
  const stops = prizes.map((_, i) => `${i % 2 === 0 ? 'var(--brand)' : 'var(--fg)'} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
  return (
    <div className="relative mx-auto h-64 w-64">
      <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-fg" aria-hidden />
      <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${stops})`, transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4.2s cubic-bezier(0.12, 0.8, 0.1, 1)' : 'none' }}>
        {prizes.map((p, i) => (
          <div key={p.id} className="absolute left-1/2 top-1/2 origin-left text-[11px] font-semibold leading-tight" style={{ transform: `rotate(${i * seg + seg / 2 - 90}deg) translateX(40px)`, width: 80, color: i % 2 === 0 ? 'var(--brand-fg)' : 'var(--surface)' }}>
            <span className="block truncate">{p.title}</span>
          </div>
        ))}
      </div>
      <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface" aria-hidden />
    </div>
  );
}

/** Roleta da semana: quem mais recebeu moedas na semana anterior gira uma vez. Prêmios definidos pelo CEO. */
export function WeekWheel({ wheel: w, meId }: { wheel: WheelData; meId: string }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ index: number; title: string } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spin = useMutation({
    mutationFn: () => api<{ index: number; reward: { title: string } }>('/wheel/spin', { method: 'POST' }),
    onSuccess: (r) => { setResult({ index: r.index, title: r.reward.title }); setSpinning(true); },
    onError: (e: any) => setError(e?.message ?? 'Não deu para girar'),
  });
  const done = useRef(() => { setSpinning(false); setRevealed(true); qc.invalidateQueries({ queryKey: ['home'] }); }).current;

  const isMe = w.winner?.user_id === meId;
  const pending = !!w.winner && !w.spin;
  return (
    <section aria-labelledby="wheel-title">
      <h2 id="wheel-title" className="font-display text-xl leading-none text-fg-muted">Roleta da semana</h2>
      {!w.winner && <p className="mt-3 text-sm text-fg-muted">Ninguém recebeu moeda na semana passada. A roleta volta na segunda.</p>}
      {w.winner && (
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={w.winner.name} src={w.winner.avatar_url} size={44} />
          <div className="min-w-0 flex-1">
            <div className="text-base text-fg"><span className="font-semibold">{isMe ? 'Você' : firstName(w.winner.name)}</span> {isMe ? 'ganhou' : 'ganhou'} a semana.</div>
            <div className="text-sm text-fg-muted">{w.winner.points} {w.winner.points === 1 ? 'moeda recebida' : 'moedas recebidas'} na semana passada</div>
          </div>
          {w.spin && !revealed && <div className="text-right text-sm"><div className="text-xs text-fg-muted">levou</div><div className="font-semibold text-fg">{w.spin.reward_title}</div></div>}
        </div>
      )}
      {revealed && result && (
        <div className="mt-6 space-y-4"><WheelGraphic prizes={w.prizes} targetIndex={result.index} spinning={false} onDone={() => {}} /><p className="text-center text-lg text-fg">Você levou <b>{result.title}</b>. Combine a entrega com o Iran.</p></div>
      )}
      {!revealed && pending && w.prizes.length > 0 && (
        <div className="mt-6 space-y-4">
          <WheelGraphic prizes={w.prizes} targetIndex={result?.index ?? null} spinning={spinning} onDone={done} />
          {isMe ? (
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" className="px-8" onClick={() => { setError(null); spin.mutate(); }} loading={spin.isPending || spinning}>{spinning ? 'Girando…' : 'Girar a roleta'}</Button>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          ) : <p className="text-center text-sm text-fg-muted">{firstName(w.winner!.name)} ainda não girou. Prêmios: {w.prizes.map((p) => p.title).join(' · ')}</p>}
        </div>
      )}
      {pending && w.prizes.length === 0 && <p className="mt-3 text-sm text-fg-muted">Nenhum prêmio cadastrado na roleta ainda.</p>}
    </section>
  );
}
