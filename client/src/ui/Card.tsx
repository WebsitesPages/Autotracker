import type { ReactNode } from 'react';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-night-800/80 border border-white/[0.06] rounded-2xl ${onClick ? 'cursor-pointer hover:border-white/[0.14] transition-colors' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[13px] font-semibold text-night-200 uppercase tracking-wider flex items-center gap-2">
        {icon && <span className="text-gold-400">{icon}</span>}
        {children}
      </h3>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'default', icon }: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'positive' | 'negative' | 'gold' | 'warn';
  icon?: ReactNode;
}) {
  const valueColor = {
    default: 'text-night-50',
    positive: 'text-emerald-400',
    negative: 'text-rose-400',
    gold: 'text-gold-300',
    warn: 'text-amber-300'
  }[tone];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2 text-night-300">
        {icon && <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`font-display text-2xl sm:text-[26px] font-bold leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-night-400 mt-1.5">{sub}</div>}
    </Card>
  );
}
