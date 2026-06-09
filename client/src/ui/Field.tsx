import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const base =
  'w-full bg-night-700/70 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-night-50 ' +
  'placeholder:text-night-400 outline-none transition focus:border-gold-500/60 focus:ring-2 focus:ring-gold-500/15';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-night-300 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-night-400 mt-1">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${base} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${base} appearance-none ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${base} resize-none ${props.className ?? ''}`} />;
}

// Umschalter Pot/Privat etc. als Segmente statt Dropdown
export function Segmented<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex bg-night-700/70 border border-white/[0.08] rounded-xl p-1 gap-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            value === o.value
              ? 'bg-gold-500/90 text-night-950 font-semibold'
              : 'text-night-300 hover:text-night-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
