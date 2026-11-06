import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, Button, Field, Modal, Section, Spinner, inputCls } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { PhotoPicker } from '../../features/profile/PhotoPicker';

/** Admin mínimo: pessoas, prêmios da roleta e marca/acesso. O resto do motor (temporadas, missões, prêmios) segue na API, fora da interface. */
const TABS = [['usuarios', 'Pessoas'], ['roleta', 'Roleta'], ['marca', 'Marca & acesso']] as const;

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'usuarios';
  return (
    <div className="space-y-5">
      <nav className="flex gap-1 text-sm">
        {TABS.map(([k, label]) => <button key={k} onClick={() => setParams({ tab: k })} className={`focus-ring rounded-lg px-3 py-1.5 font-medium transition ${tab === k ? 'bg-fg text-surface' : 'text-fg-2 hover:bg-card-2'}`}>{label}</button>)}
      </nav>
      {tab === 'usuarios' && <UsersPanel />}
      {tab === 'roleta' && <WheelPanel />}
      {tab === 'marca' && <SettingsPanel />}
    </div>
  );
}

function useInvalidate(keys: string[][]) { const qc = useQueryClient(); return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); }

// ---------------- Pessoas ----------------
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
    <Section title="Usuários" subtitle="Quem aparece na tela e pode dar e receber moedas." action={<Button size="sm" onClick={() => setEdit({ name: '', email: '', role: 'member', areaId: '' })}>+ Adicionar</Button>}>
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

// ---------------- Marca & acesso ----------------
function SettingsPanel() {
  const { refetch } = useAuth();
  const s = useQuery<any>({ queryKey: ['settings'], queryFn: () => api('/admin/settings') });
  const toast = useToast();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (b: any) => api('/admin/settings', { method: 'PATCH', json: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); refetch(); toast('Salvo'); },
    onError: (e: any) => toast(e?.message, 'err'),
  });
  if (!s.data) return <Spinner />;
  const d = s.data;
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      name: f.get('name'), logoUrl: (f.get('logoUrl') as string) || null, logoDarkUrl: (f.get('logoDarkUrl') as string) || null, symbolUrl: (f.get('symbolUrl') as string) || null,
      theme: f.get('theme'), fontDisplay: f.get('fontDisplay'), authMode: f.get('authMode'), primaryColor: f.get('primaryColor'), secondaryColor: f.get('secondaryColor'),
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Marca" subtitle="Nome, logo e cores vêm daqui. O app não tem nada da marca fixo no código.">
        <div className="space-y-3">
          <Field label="Nome da empresa"><input name="name" className={inputCls} defaultValue={d.name} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tema"><select name="theme" className={inputCls} defaultValue={d.theme}><option value="light">Claro</option><option value="duo">Claro com topo preto</option><option value="dark">Escuro</option></select></Field>
            <Field label="Fonte dos títulos"><select name="fontDisplay" className={inputCls} defaultValue={d.font_display}><option value="default">Padrão (Inter)</option><option value="big-shoulders">Big Shoulders Display</option></select></Field>
          </div>
          <Field label="Logo para fundo claro"><input name="logoUrl" className={inputCls} defaultValue={d.logo_url ?? ''} placeholder="https://…/logo.png ou /brand/…" /></Field>
          <Field label="Logo para fundo escuro"><input name="logoDarkUrl" className={inputCls} defaultValue={d.logo_dark_url ?? ''} placeholder="https://…/logo-dark.png" /></Field>
          <Field label="Símbolo (quadrado, 512px)" hint="Vira favicon e ícone do app instalado."><input name="symbolUrl" className={inputCls} defaultValue={d.symbol_url ?? ''} placeholder="https://…/symbol.png" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cor principal"><input name="primaryColor" type="color" className="h-10 w-full rounded-lg border border-line" defaultValue={d.primary_color} /></Field>
            <Field label="Cor de destaque"><input name="secondaryColor" type="color" className="h-10 w-full rounded-lg border border-line" defaultValue={d.secondary_color} /></Field>
          </div>
        </div>
      </Section>
      <Section title="Acesso" subtitle="Como as pessoas entram no app.">
        <Field label="Modo de acesso" hint="Por clique: a tela de entrada lista as pessoas e qualquer um entra escolhendo a si mesmo. Só para rede de confiança. Link por e-mail exige RESEND_API_KEY configurada na API.">
          <select name="authMode" className={inputCls} defaultValue={d.auth_mode}><option value="click">Por clique (sem e-mail)</option><option value="magic_link">Link por e-mail</option></select>
        </Field>
        <div className="mt-4 flex justify-end"><Button type="submit" loading={save.isPending}>Salvar</Button></div>
      </Section>
    </form>
  );
}

// ---------------- Roleta ----------------
function WheelPanel() {
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
  const prizes = rewards.data?.filter((r) => r.kind === 'wheel') ?? [];
  return (
    <div className="space-y-4">
      <Section title="Prêmios da roleta" subtitle="Toda segunda, quem mais recebeu moedas na semana anterior gira uma vez. O sorteio é no servidor, ponderado pelo peso: peso 4 sai 4x mais que peso 1. A entrega é combinada fora do app."
        action={<Button size="sm" onClick={() => setEdit({ title: '', description: '', kind: 'wheel', weight: 1, isActive: true })}>+ Prêmio</Button>}>
        {rewards.isLoading ? <Spinner /> : prizes.length === 0 ? <p className="text-sm text-fg-muted">Nenhum prêmio ainda. Sem prêmio, a roleta não aparece.</p> : (
          <ul className="divide-y divide-line">
            {prizes.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 py-2 text-sm ${r.is_active ? '' : 'opacity-50'}`}>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.title}</div>{r.description && <div className="truncate text-xs text-fg-muted">{r.description}</div>}</div>
                <span className="text-xs text-fg-muted" title="Peso no sorteio">peso {r.weight}</span>
                <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => setEdit({ id: r.id, title: r.title, description: r.description ?? '', kind: 'wheel', weight: r.weight, isActive: r.is_active })}>editar</button>
                <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-card-2" onClick={() => toggle.mutate({ id: r.id, isActive: !r.is_active })}>{r.is_active ? 'desativar' : 'ativar'}</button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Giros" subtitle="Quem ganhou, o que levou e se já foi entregue.">
        {spins.data?.length === 0 && <p className="text-sm text-fg-muted">Ninguém girou ainda.</p>}
        <ul className="divide-y divide-line">
          {spins.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <Avatar name={s.user_name} src={s.user_avatar} size={30} />
              <div className="min-w-0 flex-1"><div className="truncate"><b>{s.user_name}</b> levou <b>{s.reward_title}</b></div><div className="text-xs text-fg-muted">semana {s.week_key} · {s.points} moedas · {timeAgo(s.spun_at)}</div></div>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!s.delivered_at} onChange={(e) => deliver.mutate({ id: s.id, delivered: e.target.checked })} /> entregue</label>
            </li>
          ))}
        </ul>
      </Section>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar prêmio' : 'Novo prêmio'}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...edit, description: edit.description || null, weight: Number(edit.weight) }); }}>
            <Field label="Título"><input className={inputCls} required minLength={2} maxLength={120} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Ex.: Vale-presente R$ 200" autoFocus /></Field>
            <Field label="Descrição (opcional)"><input className={inputCls} maxLength={300} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Peso no sorteio" hint="1 = raro, 10 = comum"><input className={inputCls} type="number" min={1} max={100} value={edit.weight} onChange={(e) => setEdit({ ...edit, weight: e.target.value })} /></Field>
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
