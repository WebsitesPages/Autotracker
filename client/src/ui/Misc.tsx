import type { ReactNode } from 'react';
import { statusLabels, statusStyles } from '../format';
import type { CarStatus } from '../types';

export function StatusBadge({ status }: { status: CarStatus }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export function Empty({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-night-700/60 text-night-400 flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6">
        {icon}
      </div>
      <p className="text-sm text-night-400">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-night-400 text-sm">
      <div className="w-5 h-5 border-2 border-night-500 border-t-gold-400 rounded-full animate-spin" />
      {label ?? 'Lädt …'}
    </div>
  );
}

// Kennzahlen-Zeile (Label links, Wert rechts) für Listen-Karten
export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 text-sm py-1">
      <span className="text-night-400 shrink-0">{label}</span>
      <span className="text-night-100 text-right break-words min-w-0">{children}</span>
    </div>
  );
}
