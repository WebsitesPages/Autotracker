import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

type Kind = 'success' | 'warn' | 'error';
interface Toast { id: number; kind: Kind; message: string }

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

export const useToast = () => useContext(ToastContext);

const icons: Record<Kind, ReactNode> = {
  success: <CheckCircle2 size={17} className="text-emerald-400" />,
  warn: <AlertTriangle size={17} className="text-amber-400" />,
  error: <XCircle size={17} className="text-rose-400" />
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, kind: Kind = 'success') => {
    const id = nextId.current++;
    setToasts(t => [...t, { id, kind, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-20 sm:bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none pb-safe">
        {toasts.map(t => (
          <div
            key={t.id}
            className="sheet-in flex items-center gap-2.5 bg-night-700 border border-white/10 rounded-xl px-4 py-2.5 shadow-2xl text-sm text-night-50"
          >
            {icons[t.kind]}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
