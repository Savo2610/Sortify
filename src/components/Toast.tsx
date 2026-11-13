import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastData {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
  action?: { label: string; run: () => void };
}

type ShowToast = (text: string, opts?: { tone?: ToastData['tone']; action?: ToastData['action']; ms?: number }) => void;

const Ctx = createContext<ShowToast>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(1);

  const show = useCallback<ShowToast>((text, opts = {}) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone: opts.tone ?? 'info', action: opts.action }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.ms ?? (opts.tone === 'error' ? 6000 : 3200));
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
