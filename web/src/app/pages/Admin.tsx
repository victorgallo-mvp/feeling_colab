import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, Button, ChipTag, Empty, Field, Modal, Section, Spinner, inputCls } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { fmtDate, timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { PersonDetail } from './Seasons';
import { PhotoPicker } from '../../features/profile/PhotoPicker';

const TABS = [['fechamento', 'Fechamento'], ['premios', 'Prêmios & roleta'], ['usuarios', 'Usuários'], ['areas', 'Áreas'], ['chips', 'Motivos (chips)'], ['regras', 'Regras & marca']] as const;

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'fechamento';
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-card-2 p-1 text-sm">
        {TABS.map(([k, label]) => <button key={k} onClick={() => setParams({ tab: k })} className={`focus-ring rounded-xl px-3 py-1.5 font-medium transition ${tab === k ? 'bg-card shadow-sm' : 'text-fg-2 hover:bg-card/60'}`}>{label}</button>)}
      </nav>
      {tab === 'fechamento' && <ClosingPanel />}
      {tab === 'premios' && <RewardsPanel />}
      {tab === 'usuarios' && <UsersPanel />}
      {tab === 'areas' && <AreasPanel />}
      {tab === 'chips' && <ChipsPanel />}
      {tab === 'regras' && <SettingsPanel />}
    </div>
  );
}

function useInvalidate(keys: string[][]) { const qc = useQueryClient(); return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); }

// ---------------- Fechamento ----------------
function ClosingPanel() {
  const { refetch } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const cur = useQuery<any>({ queryKey: ['cycle-current'], queryFn: () => api('/cycles/current') });
  const sum = useQuery<any>({ queryKey: ['cycle', cur.data?.id], queryFn: () => api(`/cycles/${cur.data.id}/summary`), enabled: !!cur.data?.id });
  const [days, setDays] = useState(7);
  const inactive = useQuery<any[]>({ queryKey: ['inactive', days], queryFn: () => api(`/cycles/admin/inactive?days=${days}`) });
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<any>(null);
  const inv = useInvalidate([['home'], ['cycles'], ['cycle-current']]);
  const close = useMutation({
    mutationFn: () => api(`/cycles/${cur.data.id}/close`, { method: 'POST', json: { teamRewardNote: note || null } }),
    onSuccess: (r) => { inv(); refetch(); toast(<span>Temporada encerrada. Começou a <b>{r.next.name}</b>.</span>); nav(`/temporadas/${r.closed.id}`); },
    onError: (e: any) => toast(e?.message ?? 'Erro ao fechar', 'err'),
  });
  if (cur.isLoading || sum.isLoading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!sum.data) return null;
  const { cycle, ranking, participation, recognitions_by_user } = sum.data;
  const daysLeft = Math.ceil((+new Date(cycle.ends_at) - Date.now()) / 86400000);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="min-w-0 space-y-4 lg:col-span-8">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">{cycle.name}</h1>
              <p className="text-sm text-fg-muted">{fmtDate(cycle.starts_at)} – {fmtDate(cycle.ends_at)} · {daysLeft > 0 ? `${daysLeft} dia${daysLeft === 1 ? '' : 's'} restantes` : 'prazo encerrado, pode fechar'}</p>
            </div>
            <Button variant={daysLeft <= 0 ? 'primary' : 'soft'} onClick={() => setConfirm(true)}>Fechar temporada</Button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Kpi label="Participação" value={`${Math.round(participation.pct)}%`} hint={`meta ${cycle.goal_participation_pct}% · ${participation.met}/${participation.total}`} good={participation.reached} />
            <Kpi label="Reconhecimentos" value={Object.values(recognitions_by_user as Record<string, any[]>).reduce((a, l) => a + l.length, 0)} hint="na temporada" />
            <Kpi label="Missões validadas" value={ranking.reduce((a: number, r: any) => a + r.missions_completed, 0)} hint="pontos já creditados" />
          </div>
        </div>
        <Section title="Ranking parcial" subtitle="Clique pra ver os reconhecimentos recebidos, agrupados por motivo. É isso que embasa o prêmio individual.">
          <ol className="divide-y divide-line">
            {ranking.map((r: any) => (
              <li key={r.user_id}><button onClick={() => setOpen(r)} className="focus-ring flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-card-2">
                <span className="w-6 text-center text-sm font-semibold text-fg-faint">{r.rank}</span><Avatar name={r.name} src={r.avatar_url} size={32} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.name} {r.met_participation ? '✅' : ''}</div><div className="truncate text-xs text-fg-muted">{r.recognitions_received} recebidos · deu {r.recognitions_given} · {r.missions_completed} missões · {r.coins_unspent} moedas paradas</div></div>
                <div className="flex gap-0.5">{(r.received_by_chip_detail ?? []).map((d: any) => d.chip && <span key={d.chip.id} title={`${d.chip.label} ×${d.count}`}>{d.chip.emoji}</span>)}</div>
                <div className="w-14 text-right font-semibold tabular-nums">{r.points_total}</div>
              </button></li>
            ))}
          </ol>
        </Section>
      </div>
      <div className="min-w-0 space-y-4 lg:col-span-4">
        <Section title="Sem interagir" subtitle="Nem reconheceu, nem concluiu missão, nem reagiu." action={<select className="focus-ring h-8 rounded-lg border border-line bg-card px-2 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[3, 7, 14, 30].map((d) => <option key={d} value={d}>há {d} dias</option>)}</select>}>
          {inactive.data?.length === 0 && <Empty>Todo mundo interagiu nos últimos {days} dias 🙌</Empty>}
          <ul className="space-y-2">{inactive.data?.map((u) => <li key={u.id} className="flex items-center gap-2 text-sm"><Avatar name={u.name} src={u.avatar_url} size={28} /><span className="flex-1 truncate">{u.name}</span><span className="text-xs text-fg-faint">{new Date(u.last_activity_at).getFullYear() < 1980 ? 'nunca' : timeAgo(u.last_activity_at)}</span></li>)}</ul>
        </Section>
        <Section title="Como funciona o fechamento">
          <ul className="list-disc space-y-1 pl-4 text-sm text-fg-2">
            <li>Congela o ranking e os reconhecimentos de cada pessoa (snapshot).</li>
            <li>Calcula a meta coletiva: {cycle.goal_participation_pct}% do time com ≥{cycle.goal_min_recognitions} reconhecimentos dados e ≥{cycle.goal_min_missions} missão validada.</li>
            <li>Missões pendentes de validação são recusadas automaticamente.</li>
            <li>Abre a próxima temporada com saldo renovado pra todo mundo.</li>
            <li>Você registra o prêmio de cada pessoa na página da temporada encerrada.</li>
          </ul>
          <Link to="/temporadas" className="mt-3 inline-block text-sm text-brand-text underline">Ver temporadas anteriores</Link>
        </Section>
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} · ${open.points_total} pts` : ''}>{open && <PersonDetail r={open} recs={recognitions_by_user[open.user_id] ?? []} />}</Modal>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Fechar ${cycle.name}?`}>
        <div className="space-y-3 text-sm">
          <p>Meta coletiva: <b className={participation.reached ? 'text-success-fg' : 'text-danger'}>{participation.reached ? 'batida' : 'não batida'}</b> ({Math.round(participation.pct)}% de {cycle.goal_participation_pct}%).</p>
          <Field label="Prêmio do time (opcional, só registro)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={participation.reached ? 'Ex.: happy hour na sexta' : 'Ex.: não houve prêmio coletivo'} /></Field>
          <p className="text-xs text-fg-muted">Essa ação não pode ser desfeita. A próxima temporada abre na hora.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button><Button variant="danger" loading={close.isPending} onClick={() => close.mutate()}>Fechar temporada</Button></div>
        </div>
      </Modal>
    </div>
  );
}
function Kpi({ label, value, hint, good }: { label: string; value: string | number; hint?: string; good?: boolean }) {
  return <div className={`rounded-xl p-3 ${good ? 'bg-success-soft' : 'bg-surface'}`}><div className="text-xs uppercase tracking-wide text-fg-muted">{label}</div><div className="text-2xl font-semibold tabular-nums">{value}</div>{hint && <div className="text-xs text-fg-muted">{hint}</div>}</div>;
}

// ---------------- Usuários ----------------
function UsersPanel() {
  const users = useQuery<any[]>({ queryKey: ['admin-users'], queryFn: () => api('/admin/users') });
  const areas = useQuery<any[]>({ queryKey: ['areas'], queryFn: () => api('/admin/areas') });
  const inv = useInvalidate([['admin-users'], ['home']]);
  const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (u: any) => u.id ? api(`/admin/users/${u.id}`, { method: 'PATCH', json: u }) : api('/admin/users', { method: 'POST', json: u }),
    onSuccess: () => { inv(); setEdit(null); toast('Salvo'); }, onError: (e: any) => toast(e?.message, 'err'),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }), onSuccess: () => { inv(); toast('Usuário removido'); }, onError: (e: any) => toast(e?.message, 'err') });
  const roleLabel: any = { member: 'Colaborador', manager: 'Gestor', admin: 'Admin' };
  return (
    <Section title="Usuários" subtitle="Quem entra no app. O acesso é por link no e-mail, sem senha." action={<Button size="sm" onClick={() => setEdit({ name: '', email: '', role: 'member', areaId: '' })}>+ Adicionar</Button>}>
      {users.isLoading ? <Spinner /> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-fg-muted"><tr><th className="py-2">Nome</th><th className="hidden sm:table-cell">E-mail</th><th>Papel</th><th className="hidden md:table-cell">Área</th><th className="hidden md:table-cell">Visto</th><th></th></tr></thead>
          <tbody className="divide-y divide-line">
            {users.data?.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                <td className="py-2"><div className="flex items-center gap-2"><Avatar name={u.name} src={u.avatar_url} size={28} /><span className="font-medium">{u.name}</span>{!u.is_active && <span className="text-xs text-fg-faint">(inativo)</span>}</div></td>
                <td className="hidden text-fg-muted sm:table-cell">{u.email}</td>
                <td>{roleLabel[u.role]}</td>
                <td className="hidden text-fg-muted md:table-cell">{u.area_name ?? '—'}</td>
                <td className="hidden text-xs text-fg-faint md:table-cell">{u.last_seen_at ? timeAgo(u.last_seen_at) : 'nunca'}</td>
                <td className="text-right"><button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => setEdit({ id: u.id, name: u.name, email: u.email, role: u.role, areaId: u.area_id ?? '', avatarUrl: u.avatar_url ?? '', isActive: u.is_active })}>editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar usuário' : 'Novo usuário'}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const { avatarUrl, ...rest } = edit; save.mutate({ ...rest, areaId: edit.areaId || null }); }}>
            <Field label="Nome"><input className={inputCls} required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="E-mail"><input className={inputCls} type="email" required value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Papel"><select className={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="member">Colaborador</option><option value="manager">Gestor</option><option value="admin">Admin</option></select></Field>
              <Field label="Área"><select className={inputCls} value={edit.areaId} onChange={(e) => setEdit({ ...edit, areaId: e.target.value })}><option value="">Sem área</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
            {edit.id ? (
              <div className="rounded-xl border border-line p-3"><PhotoPicker name={edit.name || '?'} currentUrl={edit.avatarUrl || null} endpoint={`/admin/users/${edit.id}/avatar`} size={64} onChanged={(url) => setEdit({ ...edit, avatarUrl: url ?? '' })} /></div>
            ) : <p className="text-xs text-fg-faint">A foto pode ser enviada pela própria pessoa no perfil, ou por você depois de salvar.</p>}
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} /> Ativo (inativo não entra nem aparece na grade)</label>}
            <div className="flex items-center justify-between pt-2">
              {edit.id ? <button type="button" className="text-xs text-danger hover:underline" onClick={() => { if (window.confirm('Remover este usuário? O histórico dele é mantido.')) { del.mutate(edit.id); setEdit(null); } }}>remover usuário</button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" loading={save.isPending}>Salvar</Button></div>
            </div>
          </form>
        )}
      </Modal>
    </Section>
  );
}

// ---------------- Áreas ----------------
function AreasPanel() {
  const areas = useQuery<any[]>({ queryKey: ['areas'], queryFn: () => api('/admin/areas') });
  const inv = useInvalidate([['areas'], ['admin-users']]);
  const toast = useToast();
  const [name, setName] = useState('');
  const add = useMutation({ mutationFn: () => api('/admin/areas', { method: 'POST', json: { name } }), onSuccess: () => { inv(); setName(''); }, onError: (e: any) => toast(e?.message, 'err') });
  const rename = useMutation({ mutationFn: ({ id, name }: any) => api(`/admin/areas/${id}`, { method: 'PATCH', json: { name } }), onSuccess: inv, onError: (e: any) => toast(e?.message, 'err') });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/areas/${id}`, { method: 'DELETE' }), onSuccess: inv, onError: (e: any) => toast(e?.message, 'err') });
  return (
    <Section title="Áreas" subtitle="Usadas pra direcionar missões a um grupo. Cada pessoa tem uma área.">
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova área (ex.: Comercial)" /><Button type="submit" loading={add.isPending}>Adicionar</Button></form>
      <ul className="divide-y divide-line">
        {areas.data?.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
            <input className="focus-ring flex-1 rounded-lg border border-transparent px-2 py-1 hover:border-line focus:border-line" defaultValue={a.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.name) rename.mutate({ id: a.id, name: e.target.value }); }} />
            <span className="text-xs text-fg-faint">{a.users_count} pessoa{a.users_count === 1 ? '' : 's'}</span>
            <button className="text-xs text-danger hover:underline" onClick={() => { if (window.confirm(`Remover a área ${a.name}? As pessoas ficam sem área.`)) del.mutate(a.id); }}>remover</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------- Chips ----------------
function ChipsPanel() {
  const chips = useQuery<any[]>({ queryKey: ['admin-chips'], queryFn: () => api('/admin/chips') });
  const inv = useInvalidate([['admin-chips'], ['home']]);
  const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (c: any) => c.id ? api(`/admin/chips/${c.id}`, { method: 'PATCH', json: c }) : api('/admin/chips', { method: 'POST', json: c }),
    onSuccess: () => { inv(); setEdit(null); toast('Salvo'); }, onError: (e: any) => toast(e?.message, 'err'),
  });
  const end = useMutation({ mutationFn: (id: string) => api(`/admin/chips/${id}`, { method: 'DELETE' }), onSuccess: () => { inv(); toast('Vigência encerrada'); } });
  const reactivate = useMutation({ mutationFn: (id: string) => api(`/admin/chips/${id}`, { method: 'PATCH', json: { validUntil: null } }), onSuccess: inv });
  return (
    <Section title="Motivos de reconhecimento (chips)" subtitle="Obrigatórios em todo reconhecimento. Encerre a vigência em vez de apagar: o histórico continua legível." action={<Button size="sm" onClick={() => setEdit({ label: '', emoji: '', color: '#2563EB' })}>+ Novo motivo</Button>}>
      <ul className="divide-y divide-line">
        {chips.data?.map((c) => (
          <li key={c.id} className={`flex items-center gap-3 py-2.5 text-sm ${c.active ? '' : 'opacity-50'}`}>
            <ChipTag emoji={c.emoji} label={c.label} color={c.color} size="md" />
            <span className="flex-1 text-xs text-fg-faint">{c.active ? 'vigente' : c.valid_until && new Date(c.valid_until) < new Date() ? `encerrado ${timeAgo(c.valid_until)}` : `começa ${fmtDate(c.valid_from)}`}</span>
            <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => setEdit({ id: c.id, label: c.label, emoji: c.emoji ?? '', color: c.color ?? '#2563EB' })}>editar</button>
            {c.active ? <button className="text-xs text-danger hover:underline" onClick={() => end.mutate(c.id)}>encerrar</button> : <button className="text-xs text-brand-text hover:underline" onClick={() => reactivate.mutate(c.id)}>reativar</button>}
          </li>
        ))}
      </ul>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar motivo' : 'Novo motivo'}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...edit, emoji: edit.emoji || null }); }}>
            <div className="grid grid-cols-[72px_1fr] gap-3">
              <Field label="Emoji"><input className={inputCls} maxLength={8} value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} placeholder="🚀" /></Field>
              <Field label="Texto"><input className={inputCls} required minLength={2} maxLength={60} value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Ex.: Entrega acima do esperado" /></Field>
            </div>
            <Field label="Cor"><input type="color" className="h-10 w-16 rounded-lg border border-line" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></Field>
            <div className="pt-1"><span className="text-xs text-fg-muted">Prévia: </span><ChipTag emoji={edit.emoji} label={edit.label || 'Motivo'} color={edit.color} size="md" /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" loading={save.isPending}>Salvar</Button></div>
          </form>
        )}
      </Modal>
    </Section>
  );
}

// ---------------- Regras & marca ----------------
function SettingsPanel() {
  const { refetch } = useAuth();
  const s = useQuery<any>({ queryKey: ['settings'], queryFn: () => api('/admin/settings') });
  const toast = useToast();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (b: any) => api('/admin/settings', { method: 'PATCH', json: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); refetch(); toast('Configuração salva. Regras de moeda/meta valem a partir da próxima temporada.'); },
    onError: (e: any) => toast(e?.message, 'err'),
  });
  if (!s.data) return <Spinner />;
  const d = s.data;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => Number(f.get(k));
    save.mutate({
      name: f.get('name'), logoUrl: (f.get('logoUrl') as string) || null, logoDarkUrl: (f.get('logoDarkUrl') as string) || null, symbolUrl: (f.get('symbolUrl') as string) || null,
      theme: f.get('theme'), fontDisplay: f.get('fontDisplay'), authMode: f.get('authMode'), primaryColor: f.get('primaryColor'), secondaryColor: f.get('secondaryColor'), timezone: f.get('timezone'),
      coinsPerCycle: num('coinsPerCycle'), recognitionCost: num('recognitionCost'), maxPerReceiverPerCycle: num('maxPerReceiverPerCycle'),
      goalParticipationPct: num('goalParticipationPct'), goalMinRecognitions: num('goalMinRecognitions'), goalMinMissions: num('goalMinMissions'),
    });
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="Marca" subtitle="O app é white-label: nome, logo e cores vêm daqui.">
        <div className="space-y-3">
          <Field label="Nome da empresa"><input name="name" className={inputCls} defaultValue={d.name} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tema"><select name="theme" className={inputCls} defaultValue={d.theme}><option value="light">Claro</option><option value="duo">Claro com destaques pretos</option><option value="dark">Escuro</option></select></Field>
            <Field label="Fonte dos títulos"><select name="fontDisplay" className={inputCls} defaultValue={d.font_display}><option value="default">Padrão (Inter)</option><option value="big-shoulders">Big Shoulders Display</option></select></Field>
          </div>
          <Field label="Logo para fundo claro" hint="Use o arquivo oficial; o app nunca reconstrói o lettering."><input name="logoUrl" className={inputCls} defaultValue={d.logo_url ?? ''} placeholder="https://…/logo.png ou /brand/…" /></Field>
          <Field label="Logo para fundo escuro"><input name="logoDarkUrl" className={inputCls} defaultValue={d.logo_dark_url ?? ''} placeholder="https://…/logo-dark.png" /></Field>
          <Field label="Símbolo (quadrado, 512px)" hint="Vira favicon e ícone do app instalado."><input name="symbolUrl" className={inputCls} defaultValue={d.symbol_url ?? ''} placeholder="https://…/symbol.png" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cor principal"><input name="primaryColor" type="color" className="h-10 w-full rounded-lg border border-line" defaultValue={d.primary_color} /></Field>
            <Field label="Cor de destaque"><input name="secondaryColor" type="color" className="h-10 w-full rounded-lg border border-line" defaultValue={d.secondary_color} /></Field>
          </div>
          <Field label="Fuso horário" hint="Define o início/fim de semana e mês das missões e temporadas."><input name="timezone" className={inputCls} defaultValue={d.timezone} /></Field>
        </div>
      </Section>
      <Section title="Regras do jogo" subtitle="Mudanças valem a partir da próxima temporada. A atual mantém as regras com que começou.">
        <Field label="Modo de acesso" hint="Por clique: a tela de entrada lista as pessoas e qualquer um entra escolhendo a si mesmo. Use só no piloto, em rede de confiança. Link por e-mail é o modo seguro.">
          <select name="authMode" className={inputCls} defaultValue={d.auth_mode}><option value="click">Por clique (piloto, sem e-mail)</option><option value="magic_link">Link por e-mail (magic link)</option></select>
        </Field>
        <div className="my-3 border-t border-line" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Moedas por pessoa / temporada"><input name="coinsPerCycle" type="number" min={1} className={inputCls} defaultValue={d.coins_per_cycle} /></Field>
          <Field label="Custo de 1 reconhecimento"><input name="recognitionCost" type="number" min={1} className={inputCls} defaultValue={d.recognition_cost} /></Field>
          <Field label="Máx. por pessoa / temporada" hint="Anti-abuso: quantas vezes posso reconhecer a mesma pessoa."><input name="maxPerReceiverPerCycle" type="number" min={1} className={inputCls} defaultValue={d.max_per_receiver_per_cycle} /></Field>
          <Field label="Meta coletiva (% do time)"><input name="goalParticipationPct" type="number" min={1} max={100} className={inputCls} defaultValue={d.goal_participation_pct} /></Field>
          <Field label="…com ≥ N reconhecimentos dados"><input name="goalMinRecognitions" type="number" min={0} className={inputCls} defaultValue={d.goal_min_recognitions} /></Field>
          <Field label="…e ≥ N missões validadas"><input name="goalMinMissions" type="number" min={0} className={inputCls} defaultValue={d.goal_min_missions} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><Button type="submit" loading={save.isPending}>Salvar configurações</Button></div>
      </Section>
    </form>
  );
}

// ---------------- Prêmios & roleta ----------------
const KIND_LABEL: Record<string, string> = { individual: 'Prêmio individual (ranking da temporada)', team: 'Prêmio do time (meta coletiva)', wheel: 'Roleta da semana' };
function RewardsPanel() {
  const rewards = useQuery<any[]>({ queryKey: ['rewards'], queryFn: () => api('/admin/rewards') });
  const spins = useQuery<any[]>({ queryKey: ['spins'], queryFn: () => api('/admin/wheel/spins') });
  const inv = useInvalidate([['rewards'], ['spins'], ['home']]);
  const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (r: any) => r.id ? api(`/admin/rewards/${r.id}`, { method: 'PATCH', json: r }) : api('/admin/rewards', { method: 'POST', json: r }),
    onSuccess: () => { inv(); setEdit(null); toast('Salvo'); }, onError: (e: any) => toast(e?.message, 'err'),
  });
  const toggle = useMutation({ mutationFn: ({ id, isActive }: any) => api(`/admin/rewards/${id}`, { method: 'PATCH', json: { isActive } }), onSuccess: inv });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/rewards/${id}`, { method: 'DELETE' }), onSuccess: () => { inv(); setEdit(null); } });
  const deliver = useMutation({ mutationFn: ({ id, delivered }: any) => api(`/admin/wheel/spins/${id}`, { method: 'PATCH', json: { delivered } }), onSuccess: inv });
  const groups = ['individual', 'team', 'wheel'] as const;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="min-w-0 space-y-4 lg:col-span-7">
        <Section title="Catálogo de prêmios" subtitle="O app só registra e exibe. A entrega é combinada fora dele. Prêmios ativos aparecem na home de todo mundo." action={<Button size="sm" onClick={() => setEdit({ title: '', description: '', kind: 'wheel', weight: 1, isActive: true })}>+ Novo prêmio</Button>}>
          {rewards.isLoading ? <Spinner /> : groups.map((k) => {
            const list = rewards.data?.filter((r) => r.kind === k) ?? [];
            return (
              <div key={k} className="mb-4 last:mb-0">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{KIND_LABEL[k]}</div>
                {list.length === 0 && <Empty>Nenhum prêmio aqui ainda.</Empty>}
                <ul className="divide-y divide-line">
                  {list.map((r) => (
                    <li key={r.id} className={`flex items-center gap-3 py-2 text-sm ${r.is_active ? '' : 'opacity-50'}`}>
                      <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.title}</div>{r.description && <div className="truncate text-xs text-fg-muted">{r.description}</div>}</div>
                      {k === 'wheel' && <span className="text-xs text-fg-muted" title="Peso no sorteio">peso {r.weight}</span>}
                      <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => setEdit({ id: r.id, title: r.title, description: r.description ?? '', kind: r.kind, weight: r.weight, isActive: r.is_active })}>editar</button>
                      <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-card-2" onClick={() => toggle.mutate({ id: r.id, isActive: !r.is_active })}>{r.is_active ? 'desativar' : 'ativar'}</button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Section>
      </div>
      <div className="min-w-0 space-y-4 lg:col-span-5">
        <Section title="Giros da roleta" subtitle="Quem ganhou, o que levou e se já foi entregue.">
          {spins.data?.length === 0 && <Empty>Ninguém girou ainda. O vencedor da semana é quem mais recebeu pontos na semana anterior.</Empty>}
          <ul className="divide-y divide-line">
            {spins.data?.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                <Avatar name={s.user_name} src={s.user_avatar} size={30} />
                <div className="min-w-0 flex-1"><div className="truncate"><b>{s.user_name}</b> levou <b>{s.reward_title}</b></div><div className="text-xs text-fg-muted">semana {s.week_key} · {s.points} pts · {timeAgo(s.spun_at)}</div></div>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!s.delivered_at} onChange={(e) => deliver.mutate({ id: s.id, delivered: e.target.checked })} /> entregue</label>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Como funciona">
          <ul className="list-disc space-y-1 pl-4 text-sm text-fg-2">
            <li><b>Individual</b>: aparece na home como "o que está em jogo"; você decide o vencedor no fechamento, com base no ranking.</li>
            <li><b>Time</b>: destravado se a meta coletiva for batida no fechamento.</li>
            <li><b>Roleta</b>: toda segunda, quem mais recebeu pontos na semana anterior ganha um giro. O sorteio é no servidor, ponderado pelo peso. Peso 4 sai 4x mais que peso 1.</li>
          </ul>
        </Section>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar prêmio' : 'Novo prêmio'}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...edit, description: edit.description || null, weight: Number(edit.weight) }); }}>
            <Field label="Título"><input className={inputCls} required minLength={2} maxLength={120} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Ex.: Vale-presente R$ 200" autoFocus /></Field>
            <Field label="Descrição (opcional)"><input className={inputCls} maxLength={300} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Ex.: para o 1º lugar da temporada" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo"><select className={inputCls} value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="individual">Individual</option><option value="team">Time</option><option value="wheel">Roleta</option></select></Field>
              {edit.kind === 'wheel' && <Field label="Peso no sorteio" hint="1 = raro, 10 = comum"><input className={inputCls} type="number" min={1} max={100} value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: e.target.value })} /></Field>}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} /> Ativo</label>
            <div className="flex items-center justify-between pt-2">
              {edit.id ? <button type="button" className="text-xs text-danger hover:underline" onClick={() => del.mutate(edit.id)}>remover prêmio</button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" loading={save.isPending}>Salvar</Button></div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
