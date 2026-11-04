import { useEffect, useRef, useState } from 'react';
import type { Chip, Colleague, Home } from '../../api/hooks';
import { useGiveRecognition, useSetMessage } from '../../api/hooks';
import { Avatar, Button, Section } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { firstName } from '../../lib/format';
import { ApiError } from '../../api/client';

export function PeopleGrid({ data }: { data: Home }) {
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [sent, setSent] = useState<{ id: string; to: Colleague; chip: Chip } | null>(null);
  const give = useGiveRecognition();
  const toast = useToast();
  const canAfford = data.me.balance >= data.cycle.recognition_cost;

  async function send(chip: Chip) {
    if (!selected) return;
    try {
      const r = await give.mutateAsync({ receiverId: selected.id, chipId: chip.id });
      setSent({ id: r.recognition.id, to: selected, chip });
      setSelected(null);
      toast(<span>✅ Reconhecimento enviado para <b>{firstName(selected.name)}</b> · saldo: {r.balance}</span>);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Não foi possível enviar', 'err');
    }
  }

  return (
    <Section id="recognize" title="Reconhecer um colega" subtitle={canAfford ? <>Clique na pessoa, depois no motivo. <span className="text-fg-faint">Custa {data.cycle.recognition_cost} moedas · até {data.cycle.max_per_receiver}x por pessoa na temporada.</span></> : 'Você já distribuiu todas as suas moedas desta temporada. 🙌'}>
      {sent && <SentBanner sent={sent} onDone={() => setSent(null)} />}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
        {data.colleagues.map((c) => {
          const active = selected?.id === c.id;
          const disabled = !canAfford || !c.can_receive;
          return (
            <button key={c.id} type="button" disabled={disabled}
              onClick={() => setSelected(active ? null : c)}
              title={!c.can_receive ? `Você já reconheceu ${firstName(c.name)} ${c.given_count}x nesta temporada` : c.name}
              className={`focus-ring group relative flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition
                ${active ? 'border-brand bg-brand-soft shadow-sm' : 'border-transparent hover:border-line hover:bg-card-2'}
                ${disabled ? 'opacity-40 grayscale' : ''}`}>
              <Avatar name={c.name} src={c.avatar_url} size={52} className={active ? 'ring-2 ring-brand ring-offset-2' : 'group-hover:scale-105 transition-transform'} />
              <span className="w-full truncate text-xs font-medium text-fg-2">{firstName(c.name)}</span>
              {c.given_count > 0 && <span className="absolute right-1 top-1 rounded-full bg-fg px-1.5 text-[10px] font-semibold text-surface" title={`${c.given_count} nesta temporada`}>{c.given_count}</span>}
            </button>
          );
        })}
      </div>
      {selected && (
        <ChipPicker person={selected} chips={data.chips} loading={give.isPending} onPick={send} onCancel={() => setSelected(null)} />
      )}
    </Section>
  );
}

function ChipPicker({ person, chips, onPick, onCancel, loading }: { person: Colleague; chips: Chip[]; onPick: (c: Chip) => void; onCancel: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, []);
  return (
    <div ref={ref} className="animate-pop mt-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm"><Avatar name={person.name} src={person.avatar_url} size={28} /><span>Por que <b>{firstName(person.name)}</b> merece?</span></div>
        <button onClick={onCancel} className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-card">cancelar</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.id} type="button" disabled={loading} onClick={() => onPick(c)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium text-fg transition hover:-translate-y-0.5 hover:border-brand hover:bg-brand hover:text-brand-fg disabled:opacity-60"
            style={c.color ? { borderColor: `color-mix(in oklab, ${c.color} 45%, var(--card))`, color: `color-mix(in oklab, ${c.color} 75%, var(--fg))` } : undefined}>
            {c.emoji && <span aria-hidden>{c.emoji}</span>}{c.label}
          </button>
        ))}
        {chips.length === 0 && <span className="text-sm text-fg-muted">Nenhum motivo cadastrado. Peça ao admin.</span>}
      </div>
    </div>
  );
}

function SentBanner({ sent, onDone }: { sent: { id: string; to: Colleague; chip: Chip }; onDone: () => void }) {
  const [text, setText] = useState('');
  const set = useSetMessage();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  async function save() {
    if (!text.trim()) return onDone();
    try { await set.mutateAsync({ id: sent.id, message: text }); toast('Detalhe adicionado'); onDone(); } catch { toast('Não deu pra salvar o texto', 'err'); }
  }
  return (
    <div className="animate-pop mb-3 rounded-2xl border border-success/30 bg-success-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-success-fg">
        <span>✅ <b>{firstName(sent.to.name)}</b> recebeu <b>{sent.chip.emoji} {sent.chip.label}</b>. Quer detalhar? <span className="text-success-fg/70">(opcional)</span></span>
        <button onClick={onDone} className="focus-ring rounded-lg px-2 py-1 text-xs text-success-fg hover:bg-success-soft">fechar</button>
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ex.: segurou a apresentação do cliente sozinha e arrasou"
          className="focus-ring h-10 flex-1 rounded-xl border border-success/30 bg-card px-3 text-sm text-fg placeholder:text-fg-faint" />
        <Button type="submit" size="md" loading={set.isPending}>{text.trim() ? 'Salvar' : 'Ok'}</Button>
      </form>
    </div>
  );
}
