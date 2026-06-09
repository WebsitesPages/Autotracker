import { type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'success' | 'danger' | 'warn' | 'ghost' | 'subtle';

const styles: Record<Variant, string> = {
  primary: 'bg-gold-500 hover:bg-gold-400 text-night-950 font-semibold shadow-lg shadow-gold-600/15',
  success: 'bg-emerald-500 hover:bg-emerald-400 text-night-950 font-semibold shadow-lg shadow-emerald-600/15',
  danger: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30',
  warn: 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30',
  ghost: 'bg-white/[0.04] hover:bg-white/[0.08] text-night-100 border border-white/10',
  subtle: 'text-night-300 hover:text-night-100 hover:bg-white/[0.05]'
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

export function Button({ variant = 'ghost', size = 'md', className = '', ...rest }: Props) {
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none ${sizing} ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
