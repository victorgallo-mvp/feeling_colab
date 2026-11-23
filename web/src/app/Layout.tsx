import { Link, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Avatar } from '../components/ui';
import { logoFor } from '../lib/theme';
import { UserProfileModal } from '../features/profile/UserProfileModal';

/**
 * Cabeçalho: marca e quem está logado (abre o perfil, onde fica o "sair") na primeira linha;
 * abas fixas com nome na segunda, com a atual destacada. Nada muda de nome conforme a tela.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  const [profile, setProfile] = useState(false);
  const t = me?.tenant;
  const tabs: [string, string][] = [['/', 'Dar moeda'], ['/ranking', 'Ranking'], ['/como-funciona', 'Como funciona']];
  if (me?.user.role === 'admin') tabs.push(['/admin', 'Admin']);
  return (
    <div className="min-h-full">
      <header className="ink sticky top-0 z-40 bg-surface">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-5">
          <Link to="/" className="flex items-center" aria-label={t?.name ?? 'Início'}>
            {t && logoFor(t) ? <img src={logoFor(t)!} alt={t.name} className="h-6 w-auto max-w-[140px] object-contain sm:h-7" />
              : <span className="font-display text-lg text-fg">{t?.name ?? 'Reconhecimento'}</span>}
          </Link>
          {me && (
            <button onClick={() => setProfile(true)} className="focus-ring flex items-center gap-2 rounded-full py-1 pl-2 text-sm" aria-label="Meu perfil">
              <span className="text-fg-2">{me.user.name.split(' ')[0]}</span>
              <Avatar name={me.user.name} src={me.user.avatar_url} size={32} />
            </button>
          )}
        </div>
        {me && (
          <nav aria-label="Principal" className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-3">
            {tabs.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => `focus-ring whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm transition ${isActive ? 'border-brand font-semibold text-fg' : 'border-transparent text-fg-muted hover:text-fg'}`}>
                {label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="h-px w-full bg-line" aria-hidden />
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8 sm:py-10">{children}</main>
      <UserProfileModal userId={profile && me ? me.user.id : null} onClose={() => setProfile(false)} />
    </div>
  );
}
