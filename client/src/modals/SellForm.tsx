import { useState, type FormEvent } from 'react';
import { BadgeEuro } from 'lucide-react';
import { api } from '../api';
import { fmtEur, today } from '../format';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { useToast } from '../ui/Toast';
import type { Car } from '../types';

export function SellForm({ car, onClose, onSold }: { car: Car; onClose: () => void; onSold: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(car.listedSellPrice?.toString() ?? car.targetSellPrice?.toString() ?? '');
  const [date, setDate] = useState(today());
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');

  const totalCost = (car.purchasePrice || 0) + car.expenses.reduce((s, e) => s + e.amount, 0);
  const profit = price ? parseFloat(price) - totalCost : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.sellCar(car.id, {
        actualSellPrice: parseFloat(price) || 0,
        saleDate: date,
        buyerName,
        buyerContact
      });
      toast('Auto verkauft! 🎉');
      onSold();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Verkauf fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${car.brand} ${car.model} verkaufen`} icon={<BadgeEuro />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Verkaufspreis (€) *">
          <Input type="number" step="0.01" min="0.01" required autoFocus value={price}
            onChange={e => setPrice(e.target.value)} placeholder="7500" />
        </Field>
        {profit !== null && isFinite(profit) && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            profit >= 0
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
          }`}>
            Gewinn bei diesem Preis: <b className="font-display">{profit >= 0 ? '+' : ''}{fmtEur(profit)}</b>
            <span className="text-night-400"> (Gesamtkosten {fmtEur(totalCost)})</span>
          </div>
        )}
        <Field label="Verkaufsdatum">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Käufer Name">
          <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} />
        </Field>
        <Field label="Käufer Kontakt">
          <Input value={buyerContact} onChange={e => setBuyerContact(e.target.value)} placeholder="Tel / E-Mail" />
        </Field>
        <Button type="submit" variant="success" className="w-full" disabled={busy}>
          {busy ? 'Speichern …' : 'Verkauf abschließen'}
        </Button>
      </form>
    </Modal>
  );
}
