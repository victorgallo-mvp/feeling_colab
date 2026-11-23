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
          <div key={p.id} className={`absolute left-1/2 top-1/2 origin-left font-semibold leading-none ${prizes.length > 6 ? 'text-center font-display text-xl tabular-nums' : 'text-[11px]'}`} style={{ transform: prizes.length > 6 ? `rotate(${i * seg + seg / 2 - 90}deg) translateX(66px) translateY(-50%)` : `rotate(${i * seg + seg / 2 - 90}deg) translateX(40px)`, width: prizes.length > 6 ? 40 : 80, color: i % 2 === 0 ? 'var(--brand-fg)' : 'var(--surface)' }}>
            {prizes.length > 6
              ? <span className="block" style={{ transform: `rotate(${-(i * seg + seg / 2 - 90)}deg)` }}>{i + 1}</span>
              : <span className="block truncate">{p.title}</span>}
          </div>
        ))}
      </div>
      <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface" aria-hidden />
    </div>
  );
}

/** Roleta do Destaque da Semana: quem mais recebeu moedas na semana anterior gira uma vez. Prêmios definidos pelo CEO. */
export function WeekWheel({ wheel: w, meId }: { wheel: WheelData; meId: string }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ index: number; title: string; effect: 'prize' | 'double_next'; multiplier: number } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spin = useMutation({
    mutationFn: () => api<{ index: number; multiplier: number; reward: { title: string; effect: 'prize' | 'double_next' } }>('/wheel/spin', { method: 'POST' }),
    onSuccess: (r) => { setResult({ index: r.index, title: r.reward.title, effect: r.reward.effect, multiplier: r.multiplier }); setSpinning(true); },
    onError: (e: any) => setError(e?.message ?? 'Não deu para girar'),
  });
  const done = useRef(() => { setSpinning(false); setRevealed(true); qc.invalidateQueries({ queryKey: ['home'] }); }).current;

  const isMe = w.winner?.user_id === meId;
  const pending = !!w.winner && !w.spin;
  const who = w.winner ? (isMe ? 'Você' : firstName(w.winner.name)) : '';
  const doubled = (w.spin?.multiplier ?? w.multiplier) > 1;
  return (
    <section aria-labelledby="wheel-title">
      <h2 id="wheel-title" className="font-display text-xl leading-none text-fg-muted">Destaque da Semana</h2>
      {!w.winner && <p className="mt-3 text-sm text-fg-muted">Ninguém recebeu moeda na semana passada. A roleta volta na segunda.</p>}
      {w.winner && (
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={w.winner.name} src={w.winner.avatar_url} size={44} />
          <div className="min-w-0 flex-1">
            <div className="text-base text-fg"><span className="font-semibold">{who}</span> é o Destaque da semana passada.</div>
            <div className="text-sm text-fg-muted">{w.winner.points} {w.winner.points === 1 ? 'moeda recebida' : 'moedas recebidas'}, de {w.winner.givers} {w.winner.givers === 1 ? 'colega' : 'colegas diferentes'}</div>
          </div>
          {w.spin && !revealed && (
            <div className="text-right text-sm">
              <div className="text-xs text-fg-muted">{w.spin.reward_effect === 'double_next' ? 'caiu em' : w.spin.multiplier > 1 ? 'levou em dobro' : 'levou'}</div>
              <div className="font-semibold text-fg">{w.spin.reward_title}</div>
            </div>
          )}
        </div>
      )}
      {w.tiebreak.length > 1 && (
        <p className="mt-3 text-sm text-fg-muted">
          Houve empate em moedas e em colegas diferentes. No giro prévio, o maior número vence:{' '}
          {w.tiebreak.map((t, i) => <span key={t.user_id}>{i > 0 && ', '}<b className={i === 0 ? 'text-fg' : ''}>{t.user_id === meId ? 'você' : firstName(t.name)} tirou {t.roll}</b></span>)}.
        </p>
      )}
      {w.winner && doubled && pending && (
        <p className="mt-4 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-fg">Prêmio em dobro: a semana anterior caiu em “Dobre e passe para o próximo”.</p>
      )}
      {w.spin?.reward_effect === 'double_next' && !revealed && (
        <p className="mt-3 text-sm text-fg-muted">O prêmio não saiu nesta semana. O próximo Destaque gira a roleta e leva em dobro.</p>
      )}
      {revealed && result && (
        <div className="mt-6 space-y-4">
          <WheelGraphic prizes={w.prizes} targetIndex={result.index} spinning={false} onDone={() => {}} />
          <p className="text-center text-lg text-fg">
            {result.effect === 'double_next'
              ? <>Caiu em <b>{result.title}</b>. O prêmio não sai nesta semana: o próximo Destaque leva em dobro.</>
              : <>Você levou <b>{result.title}</b>{result.multiplier > 1 ? ' em dobro' : ''}. Combine a entrega com a liderança.</>}
          </p>
        </div>
      )}
      {!revealed && pending && w.prizes.length > 0 && (
        <div className="mt-6 space-y-4">
          <WheelGraphic prizes={w.prizes} targetIndex={result?.index ?? null} spinning={spinning} onDone={done} />
          {isMe ? (
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" className="px-8" onClick={() => { setError(null); spin.mutate(); }} loading={spin.isPending || spinning}>{spinning ? 'Girando…' : 'Girar a roleta'}</Button>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          ) : <p className="text-center text-sm text-fg-muted">{firstName(w.winner!.name)} ainda não girou.</p>}
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-fg-2 sm:grid-cols-2">
            {w.prizes.map((p, i) => <li key={p.id} className="flex gap-2"><span className="w-5 tabular-nums text-fg-faint">{i + 1}</span><span>{p.title}</span></li>)}
          </ol>
        </div>
      )}
      {pending && w.prizes.length === 0 && <p className="mt-3 text-sm text-fg-muted">Nenhum prêmio cadastrado na roleta ainda.</p>}
    </section>
  );
}
