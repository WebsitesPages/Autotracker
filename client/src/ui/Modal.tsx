import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Modal: am Desktop zentriert, am Handy als Bottom-Sheet
export function Modal({ title, icon, onClose, children, wide = false }: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-night-950/80 backdrop-blur-sm overlay-in" onClick={onClose} />
      <div
        className={`sheet-in relative z-10 w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92dvh] sm:max-h-[85dvh] flex flex-col bg-night-800 border border-white/[0.08] rounded-t-3xl sm:rounded-2xl shadow-2xl sm:mx-4`}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="font-display text-base font-semibold flex items-center gap-2.5">
            {icon && <span className="text-gold-400 [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>}
            {title}
          </h2>
          <button onClick={onClose} className="text-night-400 hover:text-night-100 transition-colors p-1 -m-1">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 sm:px-6 py-5 pb-safe">{children}</div>
      </div>
    </div>
  );
}
