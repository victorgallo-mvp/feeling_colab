import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Avatar, Button, Spinner, inputCls } from '../../components/ui';
import { applyTheme, logoFor } from '../../lib/theme';
import { getTokens, setTokens } from '../../lib/tokens';
import { firstName } from '../../lib/format';

/** Entrada: no modo por clique, uma tela preta com as pessoas; um clique e entrou. */
export function LoginPage() {
  const nav = useNavigate();
  const [tenant, setTenant] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [devLink, setDevLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [people, setPeople] = useState<any[] | null>(null);
  const [useEmail, setUseEmail] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);

  useEffect(() => { if (getTokens()) nav('/', { replace: true }); }, [nav]);
  useEffect(() => {
    api('/public/tenant').then((t) => {
      setTenant(t); applyTheme(t);
      if (t.auth_mode === 'click') api('/public/users').then(setPeople).catch(() => setPeople([]));
    }).catch(() => {});
  }, []);

  async function clickLogin(id: string) {
    setEntering(id); setErr(null);
    try { const t = await api('/auth/click-login', { method: 'POST', json: { userId: id } }); setTokens(t); window.dispatchEvent(new Event('auth:login')); nav('/', { replace: true }); }
    catch (e: any) { setErr(e?.message ?? 'Não foi possível entrar'); setEntering(null); }
  }
  const clickMode = tenant?.auth_mode === 'click' && !useEmail;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setState('sending');
    try {
      const r = await api('/auth/magic-link', { method: 'POST', json: { email } });
      setDevLink(r.devLink ?? null); setState('sent');
    } catch (e: any) { setErr(e?.message ?? 'Erro'); setState('idle'); }
  }

  return (
    <div className="ink min-h-screen bg-surface text-fg">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
        <div className="mb-10">
          {tenant && logoFor(tenant) ? <img src={logoFor(tenant)!} alt={tenant.name} className="h-8 w-auto max-w-[200px] object-contain" />
            : <span className="font-display text-2xl">{tenant?.name ?? ''}</span>}
        </div>
        {clickMode ? (
          <div>
            <h1 className="font-display text-4xl leading-none sm:text-5xl">Quem é você?</h1>
            <p className="mt-3 text-base text-fg-muted">Clique na sua foto para entrar.</p>
            {people === null ? <div className="flex justify-center py-16"><Spinner /></div> : (
              <div className="mt-8 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-5">
                {people.map((p) => (
                  <button key={p.id} type="button" disabled={!!entering} onClick={() => clickLogin(p.id)}
                    className={`focus-ring group flex flex-col items-center gap-2 rounded-xl py-2 transition ${entering && entering !== p.id ? 'opacity-40' : ''}`}>
                    <Avatar name={p.name} src={p.avatar_url} size={64} className={entering === p.id ? 'ring-4 ring-brand ring-offset-2 ring-offset-surface' : 'transition-transform group-hover:scale-105'} />
                    <span className="w-full truncate text-center text-sm text-fg-2">{firstName(p.name)}</span>
                  </button>
                ))}
              </div>
            )}
            {err && <div className="mt-4 text-sm text-danger">{err}</div>}
            <p className="mt-10 text-xs text-fg-faint"><button className="underline" onClick={() => setUseEmail(true)}>Entrar por e-mail</button></p>
          </div>
        ) : state === 'sent' ? (
          <div className="max-w-sm space-y-3 text-sm">
            <h1 className="font-display text-4xl leading-none">Confira seu e-mail</h1>
            <p className="text-fg-muted">Se <b className="text-fg">{email}</b> estiver cadastrado, enviamos um link de acesso. Ele vale por 15 minutos.</p>
            {devLink && <a href={devLink} className="block rounded-xl border border-dashed border-line p-3 text-fg-2">Ambiente de desenvolvimento: e-mail não configurado. <u>Clique aqui para entrar</u>.</a>}
            <button className="text-fg-muted underline" onClick={() => setState('idle')}>usar outro e-mail</button>
          </div>
        ) : (
          <form onSubmit={submit} className="max-w-sm space-y-4">
            <h1 className="font-display text-4xl leading-none">Entrar</h1>
            <label className="block text-sm"><span className="mb-1 block text-fg-2">Seu e-mail de trabalho</span>
              <input className={inputCls} type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" /></label>
            {err && <div className="text-sm text-danger">{err}</div>}
            <Button type="submit" size="lg" className="w-full" loading={state === 'sending'}>Receber link de acesso</Button>
            <p className="text-xs text-fg-faint">Sem senha. Você recebe um link e pronto.</p>
            {tenant?.auth_mode === 'click' && <p className="text-xs text-fg-faint"><button type="button" className="underline" onClick={() => setUseEmail(false)}>Voltar para entrar por clique</button></p>}
          </form>
        )}
      </div>
    </div>
  );
}

export function AuthCallbackPage() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // StrictMode roda o efeito 2x em dev; o token é de uso único
    ran.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setErr('Link inválido'); return; }
    api('/auth/verify', { method: 'POST', json: { token } })
      .then((t) => { setTokens(t); window.dispatchEvent(new Event('auth:login')); nav('/', { replace: true }); })
      .catch((e) => setErr(e?.message ?? 'Link inválido ou expirado'));
  }, [nav]);
  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-sm text-fg-2">
      {err ? <div className="card p-6 text-center"><p className="text-danger">{err}</p><Button className="mt-3" onClick={() => nav('/entrar')}>Pedir novo link</Button></div> : 'Entrando…'}
    </div>
  );
}
