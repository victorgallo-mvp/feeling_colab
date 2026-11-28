import { useEffect, useRef, useState } from 'react';
import type { Chip, Colleague, Home } from '../../api/hooks';
import { useGiveRecognition } from '../../api/hooks';
import { Avatar, Button } from '../../components/ui';
import { ApiError } from '../../api/client';
import { firstName } from '../../lib/format';

/**
 * Dar uma moeda: clique na pessoa, conte o que ela fez e envie.
 * Com regra semanal, mostra quantas moedas restam (zeram toda segunda; com trava, fecham antes, ex.: sexta 15h) e exige a justificativa.
 * Enter no texto envia; Shift+Enter quebra linha; Esc cancela.
 */
export function Recognize({ data }: { data: Home }) {
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [sent, setSent] = useState<Colleague | null>(null);
  const give = useGiveRecognition();
  const [error, setError] = useState<string | null>(null);
  const perWeek = data.rules.coins_per_week;
  const balance = data.me.balance;
  const empty = balance !== null && balance < data.cycle.recognition_cost;
  const { locked, lock_label: lockLabel } = data.week;

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 4000);
    return () => clearTimeout(t);
  }, [sent]);

  async function send(message: string, chipId: string | null) {
    if (!selected) return;
    setError(null);
    try {
      await give.mutateAsync({ receiverId: selected.id, message: message.trim() || undefined, chipId });
      setSent(selected);
      setSelected(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar. Tente de novo.');
    }
  }

  return (
    <section aria-labelledby="recognize-title">
      <h1 id="recognize-title" className="font-display text-4xl leading-none text-fg sm:text-5xl">Quem merece uma moeda?</h1>
      {perWeek > 0 && balance !== null ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1.5" role="img" aria-label={`${balance} de ${perWeek} moedas restantes`}>
            {Array.from({ length: perWeek }, (_, i) => (
              <span key={i} className={`h-5 w-5 rounded-full ${i < balance ? 'bg-brand' : 'border border-line bg-card-2'}`} />
            ))}
          </div>
          <p className="text-base text-fg-muted">
            {locked ? `As moedas desta semana fecharam na ${lockLabel}. Elas voltam na segunda.`
              : empty ? 'Suas moedas da semana acabaram. Elas voltam na segunda.'
              : <>{balance === 1 ? 'Resta' : 'Restam'} <b className="text-fg">{balance} de {perWeek}</b> {perWeek === 1 ? 'moeda' : 'moedas'} esta semana. {lockLabel ? `Elas fecham na ${lockLabel}.` : 'Elas zeram na segunda.'}</>}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-base text-fg-muted">Clique na pessoa e conte o que ela fez.</p>
      )}

      <div className={`mt-8 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5 ${empty ? 'opacity-40' : ''}`} role="list">
        {data.colleagues.map((c) => {
          const active = selected?.id === c.id;
          const justSent = sent?.id === c.id;
          return (
            <button key={c.id} type="button" role="listitem" disabled={empty} onClick={() => { setError(null); setSelected(active ? null : c); }}
              aria-pressed={active} title={c.name}
              className={`focus-ring group flex flex-col items-center gap-2 rounded-xl py-2 transition ${selected && !active ? 'opacity-40' : ''}`}>
              <Avatar name={c.name} src={c.avatar_url} size={64}
                className={`transition-transform ${active ? 'ring-4 ring-brand ring-offset-2 ring-offset-surface' : justSent ? 'ring-4 ring-brand/40 ring-offset-2 ring-offset-surface' : empty ? '' : 'group-hover:scale-105'}`} />
              <span className={`w-full truncate text-center text-sm ${active ? 'font-semibold text-fg' : 'text-fg-2'}`}>{firstName(c.name)}</span>
            </button>
          );
        })}
      </div>
      {data.colleagues.length === 0 && <p className="mt-6 text-sm text-fg-muted">Ninguém cadastrado ainda.</p>}

      <div className="mt-8 min-h-[7rem]" aria-live="polite">
        {selected && !empty ? (
          <Composer key={selected.id} person={selected} chips={data.chips} minChars={data.rules.message_min_chars} loading={give.isPending} error={error} onSend={send} onCancel={() => setSelected(null)} />
        ) : sent ? (
          <p className="animate-pop text-lg text-fg"><span className="font-semibold">{firstName(sent.name)}</span> recebeu sua moeda.</p>
        ) : null}
      </div>
    </section>
  );
}

function Composer({ person, chips, minChars, loading, error, onSend, onCancel }: {
  person: Colleague; chips: Chip[]; minChars: number; loading: boolean; error: string | null;
  onSend: (m: string, chipId: string | null) => void; onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [chipId, setChipId] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const required = minChars > 0;
  const missing = Math.max(0, minChars - text.trim().length);
  const ready = missing === 0;
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // no celular, o teclado só abre sozinho quando o texto é obrigatório
    if (required || window.matchMedia('(min-width: 640px)').matches) ref.current?.focus();
  }, [required]);
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ready && !loading) onSend(text, chipId); }
  }
  return (
    <div ref={box} className="animate-pop border-t border-fg pt-5">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} src={person.avatar_url} size={40} />
        <div className="font-display text-2xl leading-none text-fg">Moeda para {firstName(person.name)}</div>
      </div>
      <label htmlFor="rec-message" className="mt-4 block text-sm text-fg-2">
        O que {firstName(person.name)} fez? Como isso ajudou?{!required && <span className="text-fg-faint"> (opcional)</span>}
      </label>
      <textarea id="rec-message" ref={ref} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={500} rows={3}
        placeholder="Ex.: Você me ajudou a resolver uma demanda urgente hoje, mesmo estando cheio de atividades."
        aria-describedby="rec-hint"
        className="focus-ring mt-2 w-full resize-none rounded-xl border border-line bg-card px-4 py-3 text-base text-fg placeholder:text-fg-faint" />
      <p id="rec-hint" className="mt-1 text-xs text-fg-muted">
        {required ? (ready ? 'Seja específico. Faça o reconhecimento valer.' : `Toda moeda exige uma justificativa. Faltam ${missing} ${missing === 1 ? 'caractere' : 'caracteres'}.`) : 'Seja específico. Faça o reconhecimento valer.'}
      </p>
      {chips.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-fg-2">Que atitude foi essa? <span className="text-fg-faint">(opcional)</span></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((c) => {
              const on = chipId === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setChipId(on ? null : c.id)}
                  className={`focus-ring rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-fg bg-fg text-surface' : 'border-line text-fg-2 hover:border-fg-muted'}`}>
                  {c.emoji ? `${c.emoji} ` : ''}{c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex items-center gap-4">
        <Button size="lg" loading={loading} disabled={!ready} onClick={() => onSend(text, chipId)} className="px-7">Dar moeda</Button>
        <button type="button" onClick={onCancel} className="focus-ring rounded-md text-sm text-fg-muted hover:text-fg">cancelar</button>
      </div>
    </div>
  );
}
