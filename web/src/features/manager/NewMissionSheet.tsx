import { useState } from 'react';
import { useAreas, useCreateMission, useTemplates } from '../../api/hooks';
import { Button, Field, Modal, inputCls } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { recurrenceLabel } from '../../lib/format';

const blank = { title: '', description: '', points: 10, recurrence: 'weekly' as 'once' | 'weekly' | 'monthly', scope: 'all' as 'all' | 'area', areaId: '', endsAt: '' };

export function NewMissionSheet({ open, onClose, isAdmin, myAreaId }: { open: boolean; onClose: () => void; isAdmin: boolean; myAreaId: string | null }) {
  const [f, setF] = useState(blank);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const tpl = useTemplates(open);
  const areas = useAreas(open && isAdmin);
  const create = useCreateMission();
  const toast = useToast();
  const set = (k: keyof typeof blank, v: any) => setF((s) => ({ ...s, [k]: v }));

  function useTemplate(t: any) {
    setTemplateId(t.id);
    setF((s) => ({ ...s, title: t.title, description: t.description ?? '', points: t.points, recurrence: t.recurrence }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        title: f.title, description: f.description || null, points: Number(f.points), recurrence: f.recurrence,
        scope: f.scope, areaId: f.scope === 'area' ? (isAdmin ? f.areaId : myAreaId) : null,
        endsAt: f.endsAt ? new Date(f.endsAt + 'T23:59:59').toISOString() : null, templateId,
      });
      toast(<span>🎯 Missão <b>{f.title}</b> criada</span>);
      setF(blank); setTemplateId(null); onClose();
    } catch (e: any) { toast(e?.message ?? 'Erro ao criar missão', 'err'); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova missão">
      {tpl.data && tpl.data.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Começar de um modelo</div>
          <div className="flex flex-wrap gap-1.5">
            {tpl.data.map((t) => (
              <button key={t.id} type="button" onClick={() => useTemplate(t)} className={`focus-ring rounded-full border px-3 py-1 text-xs transition hover:bg-card-2 ${templateId === t.id ? 'border-brand bg-brand-soft text-brand-text' : 'border-line'}`}>{t.title} · {t.points}</button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <Field label="Título"><input className={inputCls} required minLength={3} maxLength={120} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Atualizar o status dos projetos" autoFocus /></Field>
        <Field label="Descrição curta (opcional)"><input className={inputCls} maxLength={500} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="O que conta como concluído?" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pontos"><input className={inputCls} type="number" min={1} max={1000} required value={f.points} onChange={(e) => set('points', e.target.value)} /></Field>
          <Field label="Recorrência">
            <select className={inputCls} value={f.recurrence} onChange={(e) => set('recurrence', e.target.value)}>
              {(['weekly', 'monthly', 'once'] as const).map((r) => <option key={r} value={r}>{recurrenceLabel[r][0].toUpperCase() + recurrenceLabel[r].slice(1)}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Para quem">
            <select className={inputCls} value={f.scope} onChange={(e) => set('scope', e.target.value)}>
              <option value="all">Todo o time</option>
              <option value="area" disabled={!isAdmin && !myAreaId}>{isAdmin ? 'Uma área' : 'Minha área'}</option>
            </select>
          </Field>
          {f.scope === 'area' && isAdmin ? (
            <Field label="Área"><select className={inputCls} required value={f.areaId} onChange={(e) => set('areaId', e.target.value)}><option value="">Escolha…</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          ) : (
            <Field label={f.recurrence === 'once' ? 'Prazo' : 'Vale até (opcional)'}><input className={inputCls} type="date" required={f.recurrence === 'once'} value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
          )}
        </div>
        {f.scope === 'area' && isAdmin && <Field label={f.recurrence === 'once' ? 'Prazo' : 'Vale até (opcional)'}><input className={inputCls} type="date" required={f.recurrence === 'once'} value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={create.isPending}>Criar missão</Button>
        </div>
      </form>
    </Modal>
  );
}
