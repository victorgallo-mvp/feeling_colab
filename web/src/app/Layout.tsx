import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar, Button } from '../components/ui';
import { enablePush, pushSupported } from '../lib/push';
import { logoFor } from '../lib/theme';
import { UserProfileModal } from '../features/profile/UserProfileModal';
import { useToast } from '../components/ui/toast';

export function Layout({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const toast = useToast();
  const [pushState, setPushState] = useState<'hidden' | 'ask' | 'on'>('hidden');
  const [profile, setProfile] = useState(false);
  const [photoNudge, setPhotoNudge] = useState(() => !sessionStorage.getItem('rec.photo.dismissed'));

  useEffect(() => {
    if (!me?.push.vapidPublicKey || !pushSupported()) return setPushState('hidden');
    if (Notification.permission === 'granted') return setPushState('on');
    if (Notification.permission === 'default' && !localStorage.getItem('rec.push.dismissed')) setPushState('ask');
  }, [me]);

  async function onEnablePush() {
    try { const ok = await enablePush(me!.push.vapidPublicKey!); setPushState(ok ? 'on' : 'hidden'); toast(ok ? 'Notificações ativadas' : 'Permissão negada', ok ? 'ok' : 'info'); }
    catch { toast('Não foi possível ativar notificações', 'err'); }
  }

  const t = me?.tenant;
  return (
    <div className="min-h-full">
      <header className="ink sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur">
        <div className="h-0.5 w-full bg-brand" aria-hidden />
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label={t?.name ?? 'Início'}>
            {t && logoFor(t) ? <img src={logoFor(t)!} alt={t.name} className="h-6 w-auto max-w-[120px] object-contain sm:h-7 sm:max-w-[160px]" />
              : <><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">{t?.name?.[0] ?? 'R'}</span><span className="font-semibold tracking-tight">{t?.name ?? 'Reconhecimento'}</span></>}
          </Link>
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden">
            <NavLink to="/" active={loc.pathname === '/'}>Início</NavLink>
            <NavLink to="/temporadas" active={loc.pathname.startsWith('/temporadas')}>Temporadas</NavLink>
            {me?.user.role === 'admin' && <NavLink to="/admin" active={loc.pathname.startsWith('/admin')}>Admin</NavLink>}
            {me && (
              <div className="ml-1 flex shrink-0 items-center gap-2 border-l border-line pl-2 sm:ml-2 sm:pl-3">
                <button onClick={() => setProfile(true)} className="focus-ring flex items-center gap-2 rounded-full pr-1 hover:bg-card-2" title="Meu perfil">
                  <Avatar name={me.user.name} src={me.user.avatar_url} size={30} />
                  <span className="hidden text-sm sm:inline">{me.user.name.split(' ')[0]}</span>
                </button>
                <button onClick={logout} className="focus-ring rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-card-2">sair</button>
              </div>
            )}
          </nav>
        </div>
      </header>
      {pushState === 'ask' && (
        <div className="border-b border-line bg-brand-soft">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span>🔔 Quer ser avisado quando te reconhecerem ou quando sobrar moeda pra dar?</span>
            <div className="flex gap-2"><Button size="sm" onClick={onEnablePush}>Ativar notificações</Button><Button size="sm" variant="ghost" onClick={() => { localStorage.setItem('rec.push.dismissed', '1'); setPushState('hidden'); }}>Agora não</Button></div>
          </div>
        </div>
      )}
      {me && !me.user.avatar_url && photoNudge && (
        <div className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="flex items-center gap-2"><Avatar name={me.user.name} src={null} size={24} /> Coloque sua foto: fica mais fácil pros colegas te acharem na grade.</span>
            <div className="flex gap-2"><Button size="sm" onClick={() => setProfile(true)}>Adicionar foto</Button><Button size="sm" variant="ghost" onClick={() => { sessionStorage.setItem('rec.photo.dismissed', '1'); setPhotoNudge(false); }}>Depois</Button></div>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      <UserProfileModal userId={profile && me ? me.user.id : null} onClose={() => setProfile(false)} />
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return <Link to={to} className={`focus-ring shrink-0 rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3 ${active ? 'bg-fg text-surface' : 'text-fg-2 hover:bg-card-2'}`}>{children}</Link>;
}
