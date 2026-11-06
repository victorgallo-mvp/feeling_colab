import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { initials } from '../../lib/format';

export function Avatar({ name, src, size = 40, className = '' }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [err, setErr] = useState(false);
  const show = src && !err;
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-2 font-semibold text-fg-2 ring-1 ring-line ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials(name)}
      {show && <img src={src!} alt="" width={size} height={size} className="absolute inset-0 h-full w-full object-cover" onError={() => setErr(true)} loading="lazy" />}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-brand text-brand-fg hover:brightness-110 shadow-sm',
    soft: 'bg-brand-soft text-brand-text hover:brightness-95',
    ghost: 'bg-transparent text-fg-2 hover:bg-card-2',
    danger: 'bg-danger text-white hover:brightness-110',
  }[variant];
  const s = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }[size];
  return (
    <button className={`focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition disabled:opacity-50 ${v} ${s} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}{children}
    </button>
  );
}

export const Spinner = ({ className = '' }: { className?: string }) => (
  <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" /><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
);



export function Section({ title, subtitle, action, children, id, className = '' }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`card p-4 sm:p-5 ${className}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal className={`animate-slide-up max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        {title && <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{title}</h3><button onClick={onClose} className="focus-ring rounded-lg p-1 text-fg-muted hover:bg-card-2" aria-label="Fechar">✕</button></div>}
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-fg-2">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-fg-muted">{hint}</span>}</label>;
}
export const inputCls = 'focus-ring h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg placeholder:text-fg-faint';

