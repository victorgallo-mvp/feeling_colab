import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar } from '../components/ui';
import { logoFor } from '../lib/theme';
import { UserProfileModal } from '../features/profile/UserProfileModal';

/** Cabeçalho mínimo: marca, um link (Ranking ou voltar), quem está logado (abre o perfil) e sair. */
export function Layout({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const [profile, setProfile] = useState(false);
  const t = me?.tenant;
  const onAdmin = loc.pathname.startsWith('/admin');
  const onHome = loc.pathname === '/';
  return (
    <div className="min-h-full">
      <header className="ink sticky top-0 z-40 bg-surface">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-5">
          <Link to="/" className="flex items-center" aria-label={t?.name ?? 'Início'}>
            {t && logoFor(t) ? <img src={logoFor(t)!} alt={t.name} className="h-6 w-auto max-w-[140px] object-contain sm:h-7" />
              : <span className="font-display text-lg text-fg">{t?.name ?? 'Reconhecimento'}</span>}
          </Link>
          {me && (
            <div className="flex items-center gap-3 text-sm">
              <Link to={onHome ? '/ranking' : '/'} className="focus-ring rounded-md px-1 text-sm text-fg-2 hover:text-fg">{onHome ? 'Ranking' : 'Dar moeda'}</Link>
              {me.user.role === 'admin' && (
                <Link to={onAdmin ? '/' : '/admin'} className="focus-ring rounded-md px-1 text-xs text-fg-muted hover:text-fg">{onAdmin ? 'voltar' : 'admin'}</Link>
              )}
              <button onClick={() => setProfile(true)} className="focus-ring flex items-center gap-2 rounded-full" title="Meu perfil">
                <span className="hidden text-fg-2 sm:inline">{me.user.name.split(' ')[0]}</span>
                <Avatar name={me.user.name} src={me.user.avatar_url} size={32} />
              </button>
              <button onClick={logout} className="focus-ring rounded-md px-1 text-xs text-fg-muted hover:text-fg">sair</button>
            </div>
          )}
        </div>
        <div className="h-px w-full bg-brand/80" aria-hidden />
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8 sm:py-10">{children}</main>
      <UserProfileModal userId={profile && me ? me.user.id : null} onClose={() => setProfile(false)} />
    </div>
  );
}
