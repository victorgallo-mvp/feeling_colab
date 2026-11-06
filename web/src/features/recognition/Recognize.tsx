import { useEffect, useRef, useState } from 'react';
import type { Colleague, Home } from '../../api/hooks';
import { useGiveRecognition } from '../../api/hooks';
import { Avatar, Button } from '../../components/ui';
import { ApiError } from '../../api/client';
import { firstName } from '../../lib/format';

/**
 * Dar uma moeda: clique na pessoa, depois em "Dar moeda". Texto é opcional e vai junto.
 * Enter no texto envia; Shift+Enter quebra linha; Esc cancela.
 */
export function Recognize({ data }: { data: Home }) {
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [sent, setSent] = useState<Colleague | null>(null);
  const give = useGiveRecognition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 4000);
    return () => clearTimeout(t);
  }, [sent]);

  async function send(message: string) {
    if (!selected) return;
    setError(null);
    try {
      await give.mutateAsync({ receiverId: selected.id, message: message.trim() || undefined });
      setSent(selected);
      setSelected(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar. Tente de novo.');
    }
  }

  return (
    <section aria-labelledby="recognize-title">
      <h1 id="recognize-title" className="font-display text-4xl leading-none text-fg sm:text-5xl">Quem merece uma moeda?</h1>
      <p className="mt-3 text-base text-fg-muted">Clique na pessoa. Se quiser, escreva o motivo.</p>

      <div className="mt-8 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5" role="list">
        {data.colleagues.map((c) => {
          const active = selected?.id === c.id;
          const justSent = sent?.id === c.id;
          return (
            <button key={c.id} type="button" role="listitem" onClick={() => { setError(null); setSelected(active ? null : c); }}
              aria-pressed={active} title={c.name}
              className={`focus-ring group flex flex-col items-center gap-2 rounded-xl py-2 transition ${selected && !active ? 'opacity-40' : ''}`}>
              <Avatar name={c.name} src={c.avatar_url} size={64}
                className={`transition-transform ${active ? 'ring-4 ring-brand ring-offset-2 ring-offset-surface' : justSent ? 'ring-4 ring-brand/40 ring-offset-2 ring-offset-surface' : 'group-hover:scale-105'}`} />
              <span className={`w-full truncate text-center text-sm ${active ? 'font-semibold text-fg' : 'text-fg-2'}`}>{firstName(c.name)}</span>
            </button>
          );
        })}
      </div>
      {data.colleagues.length === 0 && <p className="mt-6 text-sm text-fg-muted">Ninguém cadastrado ainda.</p>}

      <div className="mt-8 min-h-[7rem]" aria-live="polite">
        {selected ? (
          <Composer key={selected.id} person={selected} loading={give.isPending} error={error} onSend={send} onCancel={() => setSelected(null)} />
        ) : sent ? (
          <p className="animate-pop text-lg text-fg"><span className="font-semibold">{firstName(sent.name)}</span> recebeu sua moeda.</p>
        ) : null}
      </div>
    </section>
  );
}

function Composer({ person, loading, error, onSend, onCancel }: { person: Colleague; loading: boolean; error: string | null; onSend: (m: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // no celular, não abre o teclado sozinho: o botão de dar moeda é o caminho principal
    if (window.matchMedia('(min-width: 640px)').matches) ref.current?.focus();
  }, []);
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(text); }
  }
  return (
    <div ref={box} className="animate-pop border-t border-fg pt-5">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} src={person.avatar_url} size={40} />
        <div className="font-display text-2xl leading-none text-fg">Moeda para {firstName(person.name)}</div>
      </div>
      <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={500} rows={2}
        placeholder="O que ela fez? (opcional)"
        className="focus-ring mt-4 w-full resize-none rounded-xl border border-line bg-card px-4 py-3 text-base text-fg placeholder:text-fg-faint" />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-4">
        <Button size="lg" loading={loading} onClick={() => onSend(text)} className="px-7">Dar moeda</Button>
        <button type="button" onClick={onCancel} className="focus-ring rounded-md text-sm text-fg-muted hover:text-fg">cancelar</button>
      </div>
    </div>
  );
}
