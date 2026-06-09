import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, Car, Wallet, Receipt, BarChart3, LogOut, CarFront } from 'lucide-react';
import { api } from '../api';
import { fmtEur, partnerName } from '../format';
import { useRefresh } from '../refresh';
import type { Page } from '../navigation';

const NAV: { page: Page; label: string; icon: typeof Car }[] = [
  { page: 'dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { page: 'cars', label: 'Fahrzeuge', icon: Car },
  { page: 'pot', label: 'Pot', icon: Wallet },
  { page: 'costs', label: 'Kosten', icon: Receipt },
  { page: 'reports', label: 'Auswertung', icon: BarChart3 }
];

export function Shell({ active, onNavigate, user, onLogout, children }: {
  active: Page;
  onNavigate: (page: Page) => void;
  user: string | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { tick } = useRefresh();
  const [potBalance, setPotBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.stats()
      .then(s => { if (!cancelled) setPotBalance(s.potBalance); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, tick]);

  const potText = potBalance === null ? '…' : fmtEur(potBalance);
  const potTone = (potBalance ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400';

  return (
    <div className="min-h-dvh">
      {/* Sidebar (Desktop) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-night-850 border-r border-white/[0.06] z-40">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-night-950 shadow-lg shadow-gold-600/20">
            <CarFront size={19} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold tracking-tight">AutoTracker</div>
            <div className="text-[11px] text-night-400">Mert &amp; Tobias</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
                active === page
                  ? 'bg-gold-500/12 text-gold-300 border border-gold-500/25 font-medium'
                  : 'text-night-300 hover:text-night-100 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-3 pb-4 space-y-3">
          <button
            onClick={() => onNavigate('pot')}
            className="w-full bg-night-700/50 border border-white/[0.06] rounded-xl px-4 py-3 text-left hover:border-emerald-500/30 transition-colors"
          >
            <div className="text-[10px] text-night-400 uppercase tracking-wider mb-0.5">Pot-Stand</div>
            <div className={`font-display text-lg font-bold ${potTone}`}>{potText}</div>
          </button>
          <div className="flex items-center justify-between px-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gold-500/15 text-gold-300 flex items-center justify-center text-xs font-bold">
                {(partnerName(user)[0] || '?').toUpperCase()}
              </div>
              <span className="text-sm text-night-200">{user ? partnerName(user) : 'Angemeldet'}</span>
            </div>
            <button onClick={onLogout} title="Abmelden" className="text-night-400 hover:text-rose-400 transition-colors p-1.5">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Header (Mobile) */}
      <header className="lg:hidden sticky top-0 z-40 bg-night-900/85 backdrop-blur-xl border-b border-white/[0.06] pt-safe">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-night-950">
              <CarFront size={17} />
            </div>
            <span className="font-display font-bold tracking-tight">AutoTracker</span>
          </div>
          <button
            onClick={() => onNavigate('pot')}
            className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full pl-3 pr-3.5 py-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className={`text-sm font-semibold font-display ${potTone}`}>{potText}</span>
          </button>
        </div>
      </header>

      {/* Inhalt */}
      <main className="lg:pl-60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 pb-28 lg:pb-10">{children}</div>
      </main>

      {/* Tab-Bar (Mobile) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-night-900/92 backdrop-blur-xl border-t border-white/[0.07] pb-safe">
        <div className="flex">
          {NAV.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] transition-colors ${
                active === page ? 'text-gold-300' : 'text-night-400'
              }`}
            >
              <Icon size={20} strokeWidth={active === page ? 2.2 : 1.8} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
