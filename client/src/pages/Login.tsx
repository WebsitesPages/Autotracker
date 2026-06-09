import { useState, type FormEvent } from 'react';
import { CarFront, Lock, ArrowRight } from 'lucide-react';
import { api } from '../api';
import type { PartnerId } from '../types';

export function Login({ onSuccess }: { onSuccess: (user: PartnerId) => void }) {
  const [user, setUser] = useState<PartnerId>('mert');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password, user);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-5 bg-[radial-gradient(900px_480px_at_50%_-120px,rgba(199,154,72,0.10),transparent_70%)]">
      <div className="w-full max-w-sm rise">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-night-950 shadow-xl shadow-gold-600/25 mb-4">
            <CarFront size={26} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">AutoTracker</h1>
          <p className="text-sm text-night-400 mt-1">Mert &amp; Tobias · Auto-Handel</p>
        </div>

        <form onSubmit={submit} className="bg-night-800/80 border border-white/[0.07] rounded-2xl p-6 space-y-5 shadow-2xl">
          <div>
            <span className="block text-xs font-medium text-night-300 mb-2">Wer bist du?</span>
            <div className="grid grid-cols-2 gap-2">
              {(['mert', 'tobias'] as PartnerId[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setUser(p)}
                  className={`py-3 rounded-xl border text-sm font-medium transition-colors ${
                    user === p
                      ? 'bg-gold-500/15 border-gold-500/40 text-gold-300'
                      : 'bg-night-700/60 border-white/[0.07] text-night-300 hover:text-night-100'
                  }`}
                >
                  {p === 'mert' ? 'Mert' : 'Tobias'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-night-300 mb-2">Passwort</span>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-night-400" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-night-700/70 border border-white/[0.08] rounded-xl pl-10 pr-3.5 py-2.5 text-sm outline-none transition focus:border-gold-500/60 focus:ring-2 focus:ring-gold-500/15"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5">{error}</p>}

          <button
            type="submit"
            disabled={busy || !password}
            className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-night-950 font-semibold py-3 rounded-xl transition-colors"
          >
            {busy ? 'Anmelden …' : 'Anmelden'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
