import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface Toast { id: number; text: ReactNode; kind: 'ok' | 'err' | 'info' }
const Ctx = createContext<(text: ReactNode, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: ReactNode, kind: Toast['kind'] = 'ok') => {
    const id = ++n.current;
    setItems((l) => [...l, { id, text, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'err' ? 5000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`animate-pop pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg ${t.kind === 'err' ? 'bg-danger text-white' : t.kind === 'info' ? 'bg-fg text-surface' : 'bg-fg text-surface'}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
