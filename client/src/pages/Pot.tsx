import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowDownLeft, ArrowUpRight, Trash2, Wallet } from 'lucide-react';
import { api } from '../api';
import { fmtDate, fmtEur, partnerName, today } from '../format';
import { Card, CardTitle, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Empty, Spinner } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { useRefresh } from '../refresh';
import type { PotTransaction, Stats } from '../types';

type Mode = 'deposit' | 'withdraw';

export function Pot() {
  const toast = useToast();
  const confirm = useConfirm();
  const { tick, bump } = useRefresh();
  const [stats, setStats] = useState<Stats | null>(null);
  const [transactions, setTransactions] = useState<PotTransaction[] | null>(null);
  const [modal, setModal] = useState<Mode | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.potTransactions()])
      .then(([s, t]) => { setStats(s); setTransactions(t); })
      .catch(() => {});
  }, [tick]);

  if (!stats || !transactions) return <Spinner />;

  const mert = stats.partners.find(p => p.id === 'mert');
  const tobias = stats.partners.find(p => p.id === 'tobias');

  async function deleteTransaction(id: string) {
    const ok = await confirm({ title: 'Transaktion löschen?', danger: true, confirmLabel: 'Löschen' });
    if (!ok) return;
    await api.deletePotTransaction(id);
    toast('Transaktion gelöscht');
    bump();
  }

  return (
    <div className="rise space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Pot</h1>
          <p className="text-sm text-night-400 mt-0.5">Gemeinsame Kasse</p>
        </div>
        <div className="flex gap-2">
          <Button variant="warn" onClick={() => setModal('withdraw')}>
            <ArrowUpFromLine size={15} /> Entnahme
          </Button>
          <Button variant="success" onClick={() => setModal('deposit')}>
            <ArrowDownToLine size={15} /> Einzahlung
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Aktueller Stand" value={fmtEur(stats.potBalance)} icon={<Wallet />}
          tone={stats.potBalance < 0 ? 'negative' : 'positive'} />
        <StatCard label="Mert offen" value={fmtEur(mert?.openReimbursement ?? 0)}
          tone={(mert?.openReimbursement ?? 0) > 0 ? 'warn' : 'default'} sub="private Auslagen" />
        <StatCard label="Tobias offen" value={fmtEur(tobias?.openReimbursement ?? 0)}
          tone={(tobias?.openReimbursement ?? 0) > 0 ? 'warn' : 'default'} sub="private Auslagen" />
      </div>

      <Card className="p-5">
        <CardTitle>Transaktionen</CardTitle>
        {transactions.length === 0 ? (
          <Empty icon={<Wallet />} text="Keine Transaktionen vorhanden" />
        ) : (
          <div className="space-y-2">
            {transactions.map(t => {
              const isW = t.type === 'withdrawal';
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 bg-night-700/40 rounded-xl px-4 py-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                      isW ? 'bg-amber-500/12 text-amber-300' : 'bg-emerald-500/12 text-emerald-400'
                    }`}>
                      {isW ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {isW ? 'Entnahme – ' : 'Einzahlung von '}{partnerName(t.partnerId)}
                      </div>
                      <div className="text-[11px] text-night-400 truncate">
                        {fmtDate(t.date)}{t.note ? ' · ' + t.note : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-display font-semibold ${isW ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {isW ? '−' : '+'}{fmtEur(t.amount)}
                    </span>
                    <button onClick={() => deleteTransaction(t.id)}
                      className="text-night-500 hover:text-rose-400 sm:opacity-0 group-hover:opacity-100 transition p-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {modal && (
        <PotModal mode={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); bump(); }} />
      )}
    </div>
  );
}

function PotModal({ mode, onClose, onSaved }: { mode: Mode; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isDeposit = mode === 'deposit';
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [partnerId, setPartnerId] = useState('mert');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = { amount: parseFloat(amount) || 0, partnerId, date, note };
      if (isDeposit) await api.potDeposit(data);
      else await api.potWithdraw(data);
      toast(isDeposit ? 'Einzahlung gespeichert' : 'Entnahme gebucht');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler beim Speichern', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isDeposit ? 'Einzahlung in den Pot' : 'Entnahme aus dem Pot'}
      icon={isDeposit ? <ArrowDownToLine /> : <ArrowUpFromLine />}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Betrag (€) *">
          <Input type="number" step="0.01" min="0.01" required autoFocus value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="1000" />
        </Field>
        <Field label={isDeposit ? 'Eingezahlt von' : 'Entnommen von'}>
          <Select value={partnerId} onChange={e => setPartnerId(e.target.value)}>
            <option value="mert">Mert</option>
            <option value="tobias">Tobias</option>
            <option value="both">Beide</option>
          </Select>
        </Field>
        <Field label="Datum">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Notiz">
          <Input value={note} onChange={e => setNote(e.target.value)}
            placeholder={isDeposit ? 'z.B. Startkapital' : 'z.B. Gewinnauszahlung'} />
        </Field>
        <Button type="submit" variant={isDeposit ? 'success' : 'warn'} className="w-full" disabled={busy}>
          {busy ? 'Speichern …' : isDeposit ? 'Einzahlen' : 'Entnahme buchen'}
        </Button>
      </form>
    </Modal>
  );
}
