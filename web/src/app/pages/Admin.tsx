import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Avatar, Button, Field, Modal, Section, Spinner, inputCls } from '../../components/ui';
import { useToast } from '../../components/ui/toast';
import { timeAgo } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { PhotoPicker } from '../../features/profile/PhotoPicker';

/** Admin: pessoas e acesso, roleta, regras do programa, jogo justo e marca. O resto do motor (temporadas, missões) segue na API, fora da interface. */
const TABS = [['usuarios', 'Pessoas'], ['roleta', 'Roleta'], ['regras', 'Regras'], ['justo', 'Jogo justo'], ['marca', 'Marca & acesso']] as const;

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'usuarios';
  return (
    <div className="space-y-5">
      <ClickAccessBanner />
      <nav className="flex flex-wrap gap-1 text-sm">
        {TABS.map(([k, label]) => <button key={k} onClick={() => setParams({ tab: k })} className={`focus-ring rounded-lg px-3 py-1.5 font-medium transition ${tab === k ? 'bg-fg text-surface' : 'text-fg-2 hover:bg-card-2'}`}>{label}</button>)}
      </nav>
      {tab === 'usuarios' && <UsersPanel />}
      {tab === 'roleta' && <WheelPanel />}
      {tab === 'regras' && <RulesPanel />}
      {tab === 'justo' && <FairPlayPanel />}
      {tab === 'marca' && <SettingsPanel />}
    </div>
  );
}

/**
 * Enquanto o acesso é "por clique", qualquer pessoa entra como qualquer colega. Um botão resolve na ordem segura:
 * gera o código de todo mundo, fecha o acesso por clique e mostra os códigos. Quem clica continua conectado.
 */
function ClickAccessBanner() {
  const s = useQuery<any>({ queryKey: ['settings'], queryFn: () => api('/admin/settings') });
  const { refetch } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const close = useMutation({
    mutationFn: async () => {
      const users = await api<any[]>('/admin/users');
      const list = await api<AccessCode[]>('/admin/users/access-codes', { method: 'POST', json: { ids: users.filter((u) => u.is_active).map((u) => u.id) } });
      await api('/admin/settings', { method: 'PATCH', json: { authMode: 'invite' } });
      return list;
    },
    onSuccess: (list) => { setCodes(list); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['admin-users'] }); refetch(); },
    onError: (e: any) => toast(e?.message ?? 'Não foi possível fechar o acesso', 'err'),
  });
  return (
    <>
      {s.data?.auth_mode === 'click' && (
        <div className="rounded-2xl border border-danger bg-danger-soft p-4 text-sm" role="alert">
          <p className="font-semibold text-fg">O acesso por clique está aberto.</p>
          <p className="mt-1 text-fg-2">Hoje qualquer pessoa entra escolhendo qualquer colega na tela inicial, sem senha. Feche antes de a roleta valer prêmio: cada pessoa recebe um código, entra uma vez e fica conectada por um ano. Você continua conectado neste aparelho.</p>
          <Button className="mt-3" loading={close.isPending} onClick={() => { if (window.confirm('Gerar o código de acesso de todas as pessoas ativas e fechar o acesso por clique agora? Quem não estiver conectado vai precisar do código para entrar.')) close.mutate(); }}>Gerar códigos e fechar o acesso por clique</Button>
        </div>
      )}
      <Modal open={!!codes} onClose={() => { if (window.confirm('Já copiou os códigos? Eles não aparecem de novo (mas você pode gerar outros em Pessoas).')) setCodes(null); }} title="Acesso por clique fechado. Envie os códigos." wide>
        {codes && <CodesList codes={codes} />}
      </Modal>
    </>
  );
}

function useInvalidate(keys: string[][]) { const qc = useQueryClient(); return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); }

// ---------------- Pessoas ----------------
interface AccessCode { id: string; name: string; code: string; link: string; expires_at: string }

/** "Nome; e-mail; área" por linha (também aceita vírgula ou tab, e "Nome <e-mail>"). Área é opcional. */
function parsePeople(text: string) {
  const rows: { name: string; email: string; area?: string }[] = []; const bad: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const angle = line.match(/^(.+?)\s*<([^>\s]+@[^>\s]+)>\s*[;,\t]?\s*(.*)$/);
    const parts = angle ? [angle[1], angle[2], angle[3]] : line.split(/\s*[;,\t]\s*/);
    const emailAt = parts.findIndex((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    const name = emailAt === 0 ? parts[1] : parts[0];
    if (emailAt < 0 || !name || name.trim().length < 2) { bad.push(line); continue; }
    const area = parts.filter((_, i) => i !== emailAt && parts[i] !== name)[0]?.trim();
    rows.push({ name: name.trim(), email: parts[emailAt].trim().toLowerCase(), ...(area ? { area } : {}) });
  }
  return { rows, bad };
}

function UsersPanel() {
  const { me } = useAuth();
  const users = useQuery<any[]>({ queryKey: ['admin-users'], queryFn: () => api('/admin/users') });
  const areas = useQuery<any[]>({ queryKey: ['areas'], queryFn: () => api('/admin/areas') });
  const inv = useInvalidate([['admin-users'], ['home'], ['areas']]);
  const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const save = useMutation({
    mutationFn: (u: any) => u.id ? api(`/admin/users/${u.id}`, { method: 'PATCH', json: u }) : api('/admin/users', { method: 'POST', json: u }),
    onSuccess: () => { inv(); setEdit(null); toast('Salvo'); }, onError: (e: any) => toast(e?.message, 'err'),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }), onSuccess: () => { inv(); toast('Usuário removido'); }, onError: (e: any) => toast(e?.message, 'err') });
  const bulk = useMutation({
    mutationFn: (b: { ids: string[]; action: 'activate' | 'deactivate' | 'remove' }) => api<{ affected: number }>('/admin/users/bulk-action', { method: 'POST', json: b }),
    onSuccess: (r, b) => { inv(); setPicked(new Set()); toast(`${r.affected} ${r.affected === 1 ? 'pessoa' : 'pessoas'} ${b.action === 'activate' ? 'reativada(s)' : b.action === 'deactivate' ? 'desativada(s)' : 'removida(s)'}`); },
    onError: (e: any) => toast(e?.message, 'err'),
  });
  const genCodes = useMutation({
    mutationFn: (ids: string[]) => api<AccessCode[]>('/admin/users/access-codes', { method: 'POST', json: { ids } }),
    onSuccess: (r) => { inv(); setCodes(r); if (r.length === 0) toast('Nenhuma pessoa ativa na seleção', 'err'); }, onError: (e: any) => toast(e?.message, 'err'),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }), onSuccess: () => { inv(); toast('Aparelhos desconectados'); }, onError: (e: any) => toast(e?.message, 'err') });
  const importPeople = useMutation({
    mutationFn: (rows: any[]) => api<{ created: any[]; skipped: { email: string; reason: string }[] }>('/admin/users/bulk', { method: 'POST', json: { users: rows } }),
    onSuccess: (r) => { inv(); setImporting(false); setImportText(''); toast(`${r.created.length} adicionada(s)${r.skipped.length ? `, ${r.skipped.length} já existia(m)` : ''}`); },
    onError: (e: any) => toast(e?.message, 'err'),
  });

  const roleLabel: any = { member: 'Colaborador', manager: 'Gestor', admin: 'Admin' };
  const list = users.data ?? [];
  const allPicked = list.length > 0 && list.every((u) => picked.has(u.id));
  const ids = [...picked];
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const parsed = parsePeople(importText);
  const access = (u: any) => !u.is_active ? { label: 'inativo', cls: 'text-fg-faint' }
    : u.has_session ? { label: 'conectado', cls: 'text-success-fg' }
    : u.code_expires_at ? { label: 'código enviado', cls: 'text-warn-fg' }
    : { label: 'sem acesso', cls: 'text-fg-muted' };

  return (
    <Section title="Pessoas" subtitle="Quem aparece na tela e pode dar e receber moedas. Cada pessoa entra uma vez com um código e o aparelho fica conectado por um ano."
      action={<div className="flex shrink-0 gap-2"><Button size="sm" variant="ghost" onClick={() => setImporting(true)}>Importar lista</Button><Button size="sm" onClick={() => setEdit({ name: '', email: '', role: 'member', areaId: '' })}>+ Adicionar</Button></div>}>
      {picked.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-card-2 px-3 py-2 text-sm">
          <span className="mr-1 font-medium text-fg">{picked.size} {picked.size === 1 ? 'selecionada' : 'selecionadas'}</span>
          <Button size="sm" loading={genCodes.isPending} onClick={() => genCodes.mutate(ids)}>Gerar códigos de acesso</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids, action: 'activate' })}>Reativar</Button>
          <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Desativar ${picked.size} pessoa(s)? Elas saem da grade e do ranking e são desconectadas. Dá para reativar depois.`)) bulk.mutate({ ids, action: 'deactivate' }); }}>Desativar</Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => { if (window.confirm(`Remover ${picked.size} pessoa(s)? O histórico é mantido, mas a remoção não tem volta pela tela.`)) bulk.mutate({ ids, action: 'remove' }); }}>Remover</Button>
          <button className="focus-ring ml-auto rounded-md text-xs text-fg-muted hover:text-fg" onClick={() => setPicked(new Set())}>limpar seleção</button>
        </div>
      )}
      {users.isLoading ? <Spinner /> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-fg-muted"><tr>
            <th className="w-8 py-2"><input type="checkbox" aria-label="Selecionar todas" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((u) => u.id)))} /></th>
            <th>Nome</th><th className="hidden sm:table-cell">E-mail</th><th className="hidden md:table-cell">Área</th><th>Acesso</th><th></th></tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((u) => {
              const a = access(u);
              return (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-60'}>
                  <td className="py-2"><input type="checkbox" aria-label={`Selecionar ${u.name}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} /></td>
                  <td className="py-2"><div className="flex items-center gap-2"><Avatar name={u.name} src={u.avatar_url} size={28} /><span className="min-w-0"><span className="block font-medium">{u.name}{u.id === me?.user.id && <span className="ml-1 text-xs font-normal text-fg-faint">(você)</span>}</span>{u.role !== 'member' && <span className="block text-xs text-fg-muted">{roleLabel[u.role]}</span>}</span></div></td>
                  <td className="hidden max-w-[11rem] truncate pr-3 text-fg-muted sm:table-cell" title={u.email}>{u.email}</td>
                  <td className="hidden pr-3 text-fg-muted md:table-cell">{u.area_name ?? '—'}</td>
                  <td className={`whitespace-nowrap pr-2 text-xs ${a.cls}`} title={u.last_seen_at ? `Visto ${timeAgo(u.last_seen_at)}` : 'Nunca entrou'}>{a.label}</td>
                  <td className="text-right"><button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => setEdit({ id: u.id, name: u.name, email: u.email, role: u.role, areaId: u.area_id ?? '', avatarUrl: u.avatar_url ?? '', isActive: u.is_active, hasSession: u.has_session })}>editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar pessoa' : 'Nova pessoa'}>
        {edit && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const { avatarUrl, hasSession, ...rest } = edit; save.mutate({ ...rest, areaId: edit.areaId || null }); }}>
            <Field label="Nome"><input className={inputCls} required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="E-mail" hint="Só identifica a pessoa. O app não envia e-mail."><input className={inputCls} type="email" required value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Papel"><select className={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="member">Colaborador</option><option value="manager">Gestor</option><option value="admin">Admin</option></select></Field>
              <Field label="Área"><select className={inputCls} value={edit.areaId} onChange={(e) => setEdit({ ...edit, areaId: e.target.value })}><option value="">Sem área</option>{areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
            {edit.id ? (
              <div className="rounded-xl border border-line p-3"><PhotoPicker name={edit.name || '?'} currentUrl={edit.avatarUrl || null} endpoint={`/admin/users/${edit.id}/avatar`} size={64} onChanged={(url) => setEdit({ ...edit, avatarUrl: url ?? '' })} /></div>
            ) : <p className="text-xs text-fg-faint">Depois de salvar, selecione a pessoa na lista e gere o código de acesso dela.</p>}
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} /> Ativo (inativo não entra nem aparece na grade)</label>}
            {edit.id && edit.isActive && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-line p-3">
                <Button type="button" size="sm" variant="soft" loading={genCodes.isPending} onClick={() => genCodes.mutate([edit.id])}>Gerar novo código de acesso</Button>
                <Button type="button" size="sm" variant="ghost" disabled={!edit.hasSession} onClick={() => { if (window.confirm('Desconectar todos os aparelhos desta pessoa? Ela vai precisar de um código novo para entrar.')) { revoke.mutate(edit.id); setEdit({ ...edit, hasSession: false }); } }}>Desconectar aparelhos</Button>
                <p className="w-full text-xs text-fg-muted">Perdeu o acesso ou trocou de celular? Gere um código novo. O anterior deixa de valer.</p>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              {edit.id ? <button type="button" className="text-xs text-danger hover:underline" onClick={() => { if (window.confirm('Remover esta pessoa? O histórico dela é mantido.')) { del.mutate(edit.id); setEdit(null); } }}>remover pessoa</button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" loading={save.isPending}>Salvar</Button></div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={importing} onClose={() => setImporting(false)} title="Importar lista de pessoas" wide>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (parsed.rows.length) importPeople.mutate(parsed.rows); }}>
          <Field label="Uma pessoa por linha" hint="Formato: Nome; e-mail; área. A área é opcional e é criada se não existir. Quem já está cadastrado (mesmo e-mail) é ignorado.">
            <textarea className={`${inputCls} h-48 py-2 font-mono text-xs`} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'Ana Beatriz; ana@empresa.com; Atendimento\nBruno Lima; bruno@empresa.com'} autoFocus />
          </Field>
          <p className="text-sm text-fg-2">{parsed.rows.length} {parsed.rows.length === 1 ? 'pessoa reconhecida' : 'pessoas reconhecidas'}{parsed.bad.length > 0 && <span className="text-danger">, {parsed.bad.length} {parsed.bad.length === 1 ? 'linha' : 'linhas'} sem nome ou e-mail válido: {parsed.bad.slice(0, 3).join(' | ')}{parsed.bad.length > 3 ? '…' : ''}</span>}</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setImporting(false)}>Cancelar</Button><Button type="submit" loading={importPeople.isPending} disabled={parsed.rows.length === 0}>Adicionar {parsed.rows.length || ''}</Button></div>
        </form>
      </Modal>

      <Modal open={!!codes && codes.length > 0} onClose={() => setCodes(null)} title="Códigos de acesso" wide>
        {codes && <CodesList codes={codes} />}
      </Modal>
    </Section>
  );
}

function CodesList({ codes }: { codes: AccessCode[] }) {
  const toast = useToast();
  const { me } = useAuth();
  const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => toast(msg), () => toast('Não consegui copiar. Selecione e copie manualmente.', 'err'));
  const invite = (c: AccessCode) => `Oi, ${c.name.split(' ')[0]}! Seu acesso ao app de reconhecimento da ${me?.tenant.name ?? 'empresa'}: ${c.link}\nSe pedir código: ${c.code}. Vale uma vez, até ${new Date(c.expires_at).toLocaleDateString('pt-BR')}.`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-2">Envie a cada pessoa o código (ou o link) dela. Vale uma única vez, por 7 dias; depois de usado, o aparelho fica conectado por um ano. <b className="text-fg">Copie agora: os códigos não aparecem de novo.</b></p>
      <ul className="divide-y divide-line">
        {codes.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
            <code className="rounded-md bg-card-2 px-2 py-1 font-mono text-base tracking-widest text-fg">{c.code}</code>
            <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => copy(invite(c), `Mensagem de ${c.name.split(' ')[0]} copiada`)}>copiar mensagem</button>
            <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => copy(c.link, 'Link copiado')}>copiar link</button>
          </li>
        ))}
      </ul>
      {codes.length > 1 && <div className="flex justify-end"><Button size="sm" variant="soft" onClick={() => copy(codes.map((c) => `${c.name}\t${c.code}\t${c.link}`).join('\n'), 'Lista copiada')}>Copiar todos (nome, código, link)</Button></div>}
    </div>
  );
}

// ---------------- Regras ----------------
function RulesPanel() {
  const s = useQuery<any>({ queryKey: ['settings'], queryFn: () => api('/admin/settings') });
  const toast = useToast();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (b: any) => api('/admin/settings', { method: 'PATCH', json: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['home'] }); toast('Salvo'); },
    onError: (e: any) => toast(e?.message, 'err'),
  });
  if (!s.data) return <Spinner />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save.mutate({ coinsPerWeek: Number(f.get('coinsPerWeek')), messageMinChars: Number(f.get('messageMinChars')) }); }}>
      <Section title="Regras do programa" subtitle="As moedas sempre zeram na virada da semana (segunda-feira, 00:00) e nunca acumulam. Mudanças aqui valem na hora.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Moedas por pessoa, por semana" hint="Padrão do programa: 5. Zero desliga o limite semanal."><input name="coinsPerWeek" type="number" min={0} max={1000} required className={inputCls} defaultValue={s.data.coins_per_week} /></Field>
          <Field label="Tamanho mínimo da justificativa" hint="Em caracteres. Zero deixa o texto opcional."><input name="messageMinChars" type="number" min={0} max={200} required className={inputCls} defaultValue={s.data.message_min_chars} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><Button type="submit" loading={save.isPending}>Salvar</Button></div>
      </Section>
    </form>
  );
}

// ---------------- Jogo justo ----------------
function FairPlayPanel() {
  const [weeks, setWeeks] = useState(4);
  const qc = useQueryClient();
  const toast = useToast();
  const coins = useQuery<any[]>({ queryKey: ['admin-coins'], queryFn: () => api('/admin/recognitions') });
  const annul = useMutation({
    mutationFn: (id: string) => api(`/admin/recognitions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { for (const k of ['admin-coins', 'fairplay', 'home']) qc.invalidateQueries({ queryKey: [k] }); toast('Moeda anulada'); },
    onError: (e: any) => toast(e?.message, 'err'),
  });
  const r = useQuery<any>({ queryKey: ['fairplay', weeks], queryFn: () => api(`/admin/fairplay?weeks=${weeks}`) });
  const wk = (d: string) => `semana de ${new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  const Empty = () => <p className="text-sm text-fg-muted">Nada fora do padrão no período.</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-fg-2">
        <label htmlFor="fp-weeks">Período</label>
        <select id="fp-weeks" className="focus-ring h-10 shrink-0 rounded-xl border border-line bg-card px-3 text-sm text-fg" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          <option value={1}>Esta semana</option><option value={4}>Últimas 4 semanas</option><option value={12}>Últimas 12 semanas</option>
        </select>
        <span className="text-xs text-fg-muted">Nada aqui bloqueia moeda: são pontos para a liderança olhar e conversar.</span>
      </div>
      {!r.data ? <Spinner /> : (
        <>
          <Section title="Trocas recíprocas" subtitle="Duas pessoas que deram moedas uma para a outra na mesma semana. Pode ser genuíno; repetição é que merece atenção.">
            {r.data.reciprocal.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-line">{r.data.reciprocal.map((x: any, i: number) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm"><b>{x.a_name}</b> e <b>{x.b_name}</b><span className="text-fg-muted">{x.a_to_b} para lá, {x.b_to_a} para cá · {wk(x.week_start)}</span></li>
              ))}</ul>
            )}
          </Section>
          <Section title="Concentração" subtitle="Alguém deu 3 ou mais moedas para a mesma pessoa na mesma semana.">
            {r.data.concentrated.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-line">{r.data.concentrated.map((x: any, i: number) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm"><b>{x.giver_name}</b> deu <b>{x.coins} moedas</b> para <b>{x.receiver_name}</b><span className="text-fg-muted">{wk(x.week_start)}</span></li>
              ))}</ul>
            )}
          </Section>
          <Section title="Justificativas curtas" subtitle="Moedas com menos de 25 caracteres de contexto.">
            {r.data.short.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-line">{r.data.short.map((x: any) => (
                <li key={x.id} className="py-2 text-sm"><b>{x.giver_name}</b> para <b>{x.receiver_name}</b> <span className="text-fg-muted">· {timeAgo(x.created_at)}</span><div className="text-fg-2">{x.message ? `“${x.message}”` : <i className="text-fg-faint">sem texto</i>}</div></li>
              ))}</ul>
            )}
          </Section>
        </>
      )}
      <Section title="Moedas recentes" subtitle="Últimos 14 dias. Anular tira a moeda do mural e do ranking; se for desta semana, ela volta para o saldo de quem deu. Use para moeda de teste ou indevida.">
        {!coins.data ? <Spinner /> : coins.data.length === 0 ? <p className="text-sm text-fg-muted">Nenhuma moeda no período.</p> : (
          <ul className="divide-y divide-line">{coins.data.map((x) => (
            <li key={x.id} className="flex items-start gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1"><b>{x.giver_name}</b> para <b>{x.receiver_name}</b> <span className="text-fg-muted">· {timeAgo(x.created_at)}</span><div className="text-fg-2">{x.message ? `“${x.message}”` : <i className="text-fg-faint">sem texto</i>}</div></div>
              <button className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs text-danger hover:bg-danger-soft" disabled={annul.isPending}
                onClick={() => { if (window.confirm(`Anular a moeda de ${x.giver_name} para ${x.receiver_name}?`)) annul.mutate(x.id); }}>anular</button>
            </li>
          ))}</ul>
        )}
      </Section>
    </div>
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
        <Field label="Modo de acesso" hint="Por código: você gera o código de cada pessoa em Pessoas, ela digita uma vez e o aparelho fica conectado por um ano. Antes de mudar para este modo, gere e distribua os códigos (quem já está conectado continua). Link por e-mail exige RESEND_API_KEY configurada na API.">
          <select name="authMode" className={inputCls} defaultValue={d.auth_mode}><option value="invite">Por código de acesso (recomendado)</option>{(d.auth_mode === 'click' || import.meta.env.DEV) && <option value="click">Por clique (sem senha, inseguro)</option>}<option value="magic_link">Link por e-mail</option></select>
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
  const deliver = useMutation({ mutationFn: ({ id, ...b }: { id: string; status?: string; note?: string | null }) => api(`/admin/wheel/spins/${id}`, { method: 'PATCH', json: b }), onSuccess: inv, onError: (e: any) => toast(e?.message, 'err') });
  // ativos primeiro, na ordem da roleta; desativados no fim
  const prizes = (rewards.data?.filter((r) => r.kind === 'wheel') ?? []).sort((a, b) => Number(b.is_active) - Number(a.is_active));
  return (
    <div className="space-y-4">
      <Section title="Prêmios da roleta" subtitle="Toda segunda, o Destaque da Semana (quem mais recebeu moedas na semana anterior) gira uma vez. O sorteio é no servidor, ponderado pelo peso: peso 3 sai 3x mais que peso 1."
        action={<Button size="sm" onClick={() => setEdit({ title: '', description: '', kind: 'wheel', weight: 1, isActive: true, effect: 'prize' })}>+ Prêmio</Button>}>
        {rewards.isLoading ? <Spinner /> : prizes.length === 0 ? <p className="text-sm text-fg-muted">Nenhum prêmio ainda. Sem prêmio, a roleta não aparece.</p> : (
          <ul className="divide-y divide-line">
            {prizes.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 py-2 text-sm ${r.is_active ? '' : 'opacity-50'}`}>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.title}{r.effect === 'double_next' && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-fg">dobra</span>}</div>{r.description && <div className="truncate text-xs text-fg-muted">{r.description}</div>}</div>
                <span className="text-xs text-fg-muted" title="Peso no sorteio">peso {r.weight}</span>
                <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-2 hover:bg-card-2" onClick={() => setEdit({ id: r.id, title: r.title, description: r.description ?? '', kind: 'wheel', weight: r.weight, isActive: r.is_active, effect: r.effect })}>editar</button>
                <button className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-card-2" onClick={() => toggle.mutate({ id: r.id, isActive: !r.is_active })}>{r.is_active ? 'desativar' : 'ativar'}</button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Giros e entregas" subtitle="Quem ganhou, o que levou e em que pé está a entrega. Folga, Home Office e saída antecipada precisam ser combinados com a liderança antes de agendar.">
        {spins.data?.length === 0 && <p className="text-sm text-fg-muted">Ninguém girou ainda.</p>}
        <ul className="divide-y divide-line">
          {spins.data?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm">
              <Avatar name={s.user_name} src={s.user_avatar} size={30} />
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate">{s.reward_effect === 'double_next' ? <><b>{s.user_name}</b> caiu em <b>{s.reward_title}</b></> : <><b>{s.user_name}</b> levou <b>{s.reward_title}</b>{s.multiplier > 1 && <b> em dobro</b>}</>}</div>
                <div className="text-xs text-fg-muted">semana {s.week_key} · {s.points} {s.points === 1 ? 'moeda' : 'moedas'} · {timeAgo(s.spun_at)}</div>
              </div>
              {s.reward_effect === 'double_next' ? <span className="text-xs text-fg-muted">sem entrega: dobra o próximo</span> : (
                <>
                  <input className="focus-ring h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg placeholder:text-fg-faint w-44" aria-label={`Combinado com ${s.user_name}`} placeholder="Data ou combinado" defaultValue={s.delivery_note ?? ''} maxLength={300}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (s.delivery_note ?? '')) deliver.mutate({ id: s.id, note: v || null }); }} />
                  <select className="focus-ring h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg placeholder:text-fg-faint" aria-label={`Entrega do prêmio de ${s.user_name}`} value={s.status} onChange={(e) => deliver.mutate({ id: s.id, status: e.target.value })}>
                    <option value="pending">A combinar</option><option value="scheduled">Agendado</option><option value="delivered">Entregue</option>
                  </select>
                </>
              )}
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
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={edit.effect === 'double_next'} onChange={(e) => setEdit({ ...edit, effect: e.target.checked ? 'double_next' : 'prize' })} /><span>Dobre e passe para o próximo<span className="block text-xs text-fg-muted">Não paga prêmio: o próximo Destaque gira sem esta fatia e leva em dobro.</span></span></label>
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
