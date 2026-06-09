import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, Pencil, Trash2, Plus, BadgeEuro, Check, Banknote,
  ClipboardList, History, ExternalLink, Eye, Car as CarIcon, ShoppingCart
} from 'lucide-react';
import { api } from '../api';
import { expenseCategories, fmtDate, fmtEur, fmtKm, partnerName, statusLabels, statusStyles } from '../format';
import { Card, CardTitle, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { StatusBadge, Spinner, KV } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { useRefresh } from '../refresh';
import { CarForm } from '../modals/CarForm';
import { ExpenseForm } from '../modals/ExpenseForm';
import { SellForm } from '../modals/SellForm';
import { FilesSection } from '../files/FilesSection';
import type { Car, CarExpense } from '../types';

export function CarDetail({ carId, onBack }: { carId: string; onBack: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const [car, setCar] = useState<Car | null>(null);
  const [modal, setModal] = useState<'edit' | 'expense' | 'sell' | 'buy' | null>(null);
  const [editingExpense, setEditingExpense] = useState<CarExpense | null>(null);

  const reload = useCallback(() => {
    api.car(carId).then(setCar).catch(() => onBack());
  }, [carId, onBack]);

  useEffect(reload, [reload]);

  if (!car) return <Spinner />;

  const totalExp = car.expenses.reduce((s, e) => s + e.amount, 0);
  const totalCost = (car.purchasePrice || 0) + totalExp;
  const profit = car.status === 'sold' ? (car.actualSellPrice || 0) - totalCost : null;
  const isVisited = car.status === 'visited';

  const refresh = () => { reload(); bump(); };

  async function deleteCar() {
    const ok = await confirm({
      title: 'Auto wirklich löschen?',
      message: `${car!.brand} ${car!.model} wird mit allen Ausgaben und Dateien entfernt.`,
      confirmLabel: 'Löschen',
      danger: true
    });
    if (!ok) return;
    await api.deleteCar(car!.id);
    toast('Auto gelöscht');
    bump();
    onBack();
  }

  async function deleteExpense(expId: string) {
    const ok = await confirm({ title: 'Ausgabe löschen?', danger: true, confirmLabel: 'Löschen' });
    if (!ok) return;
    await api.deleteExpense(car!.id, expId);
    toast('Ausgabe gelöscht');
    refresh();
  }

  async function reimburseExpense(expId: string) {
    const ok = await confirm({ title: 'Erstattung als erledigt markieren?', confirmLabel: 'Erstattet' });
    if (!ok) return;
    await api.reimburseExpense(car!.id, expId);
    toast('Erstattung markiert');
    refresh();
  }

  async function reimbursePurchase() {
    const ok = await confirm({
      title: 'Kaufpreis-Erstattung buchen?',
      message: `${fmtEur(car!.purchasePrice)} werden als aus dem Pot erstattet markiert.`,
      confirmLabel: 'Erstattet'
    });
    if (!ok) return;
    await api.reimbursePurchase(car!.id);
    toast('Kaufpreis erstattet');
    refresh();
  }

  return (
    <div className="rise space-y-5">
      <button onClick={onBack} className="text-night-400 hover:text-night-100 text-sm inline-flex items-center gap-1.5 transition-colors">
        <ArrowLeft size={15} /> Zurück zu Fahrzeugen
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-3 flex-wrap">
            <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
              isVisited ? 'bg-night-700/60 text-night-300' : 'bg-gold-500/12 text-gold-300'
            }`}>
              {isVisited ? <Eye size={19} /> : <CarIcon size={19} />}
            </span>
            {car.brand} {car.model}
            <StatusBadge status={car.status} />
          </h1>
          <p className="text-night-400 text-sm mt-1.5">
            {[car.year, car.color, car.fuel, car.transmission, car.horsepower ? car.horsepower + ' PS' : '']
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          {isVisited && (
            <Button variant="primary" size="sm" onClick={() => setModal('buy')}>
              <ShoppingCart size={14} /> Als gekauft
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setModal('expense')}><Plus size={14} /> Ausgabe</Button>
          <Button variant="ghost" size="sm" onClick={() => setModal('edit')}><Pencil size={14} /> Bearbeiten</Button>
          {!isVisited && car.status !== 'sold' && (
            <Button variant="success" size="sm" onClick={() => setModal('sell')}><BadgeEuro size={14} /> Verkaufen</Button>
          )}
          <Button variant="danger" size="sm" onClick={deleteCar}><Trash2 size={14} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isVisited ? (
          <>
            <StatCard label="Inserierter Preis" value={car.listedBuyPrice ? fmtEur(car.listedBuyPrice) : '–'} />
            <StatCard label="Kosten bisher" value={fmtEur(totalExp)} tone="warn" sub={car.expenses.length + ' Posten'} />
            <StatCard label="Zielkaufpreis" value={car.purchasePrice ? fmtEur(car.purchasePrice) : '–'} />
            <StatCard label="Zielverkaufspreis" value={car.targetSellPrice ? fmtEur(car.targetSellPrice) : '–'} />
          </>
        ) : (
          <>
            <StatCard label="Kaufpreis" value={fmtEur(car.purchasePrice)}
              sub={car.listedBuyPrice ? 'Inseriert: ' + fmtEur(car.listedBuyPrice) : undefined} />
            <StatCard label="Ausgaben" value={fmtEur(totalExp)} tone="warn" sub={car.expenses.length + ' Posten'} />
            <StatCard label="Gesamt investiert" value={fmtEur(totalCost)} tone="gold" />
            {car.status === 'sold' ? (
              <StatCard label="Gewinn / Verlust"
                value={(profit! >= 0 ? '+' : '') + fmtEur(profit)}
                tone={profit! >= 0 ? 'positive' : 'negative'}
                sub={'Verkauft: ' + fmtEur(car.actualSellPrice)} />
            ) : (
              <StatCard label="Zielverkaufspreis"
                value={car.targetSellPrice ? fmtEur(car.targetSellPrice) : '–'}
                sub={car.targetSellPrice ? 'Potentiell: +' + fmtEur(car.targetSellPrice - totalCost) : undefined} />
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <CardTitle icon={<ClipboardList size={15} />}>Details</CardTitle>
          <KV label="FIN"><span className="font-mono text-[13px]">{car.vin || '–'}</span></KV>
          <KV label="Kilometerstand">{fmtKm(car.mileage)}</KV>
          {car.previousOwners != null && <KV label="Vorbesitzer">{car.previousOwners}</KV>}
          {car.serviceHistory && (
            <KV label="Scheckheft">
              {car.serviceHistory === 'ja'
                ? <span className="text-emerald-400">Ja, gepflegt</span>
                : <span className="text-rose-400">Nein</span>}
            </KV>
          )}
          {(car.lastServiceDate || car.lastServiceKm) && (
            <KV label="Letzter Service">
              {[car.lastServiceDate ? fmtDate(car.lastServiceDate) : null, car.lastServiceKm ? fmtKm(car.lastServiceKm) : null]
                .filter(Boolean).join(' · ')}
            </KV>
          )}
          <KV label="Kaufdatum">{fmtDate(car.purchaseDate)}</KV>
          {car.saleDate && <KV label="Verkaufsdatum">{fmtDate(car.saleDate)}</KV>}
          {!isVisited && (
            <KV label="Bezahlung">
              {car.purchaseFunding === 'private' ? (
                <span className="inline-flex items-center gap-2">
                  Privat ({partnerName(car.purchasePaidBy)})
                  {car.purchaseReimbursed ? (
                    <span className="text-emerald-400 text-xs">✓ erstattet</span>
                  ) : car.purchasePrice ? (
                    <button onClick={reimbursePurchase}
                      className="text-xs bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-lg hover:bg-amber-500/25 transition-colors">
                      offen – erstatten
                    </button>
                  ) : null}
                </span>
              ) : 'Pot'}
            </KV>
          )}
          <KV label="Plattform">{car.sourcePlatform || '–'}</KV>
          {car.sourceLink && (
            <KV label="Inserat">
              <a href={car.sourceLink} target="_blank" rel="noopener"
                className="text-gold-300 hover:underline inline-flex items-center gap-1">
                Link <ExternalLink size={12} />
              </a>
            </KV>
          )}
          {car.sellerName && <KV label="Verkäufer">{[car.sellerName, car.sellerContact].filter(Boolean).join(' · ')}</KV>}
          {car.buyerName && <KV label="Käufer">{[car.buyerName, car.buyerContact].filter(Boolean).join(' · ')}</KV>}
          {car.notes && (
            <div className="mt-3 p-3.5 bg-night-700/40 rounded-xl text-sm text-night-200 whitespace-pre-wrap">{car.notes}</div>
          )}
        </Card>

        <Card className="p-5">
          <CardTitle icon={<Banknote size={15} />}
            action={<Button size="sm" variant="ghost" onClick={() => setModal('expense')}><Plus size={13} /> Neu</Button>}>
            Ausgaben
          </CardTitle>
          {car.expenses.length === 0 ? (
            <p className="text-night-400 text-sm text-center py-6">Keine Ausgaben</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {car.expenses.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-2 bg-night-700/40 rounded-xl px-3.5 py-2.5 group">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{expenseCategories[e.category] || e.category}</div>
                    <div className="text-[11px] text-night-400 truncate">
                      {fmtDate(e.date)} · {e.fundingSource === 'pot' ? 'Pot' : partnerName(e.paidBy)}
                      {e.note ? ' · ' + e.note : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-display font-semibold text-sm">{fmtEur(e.amount)}</span>
                    {e.fundingSource === 'private' && !e.reimbursed && (
                      <button onClick={() => reimburseExpense(e.id)}
                        className="text-[11px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-lg hover:bg-amber-500/25 transition-colors">
                        Offen
                      </button>
                    )}
                    {e.reimbursed && <Check size={14} className="text-emerald-400" />}
                    <button onClick={() => setEditingExpense(e)} title="Bearbeiten"
                      className="text-night-500 hover:text-gold-300 sm:opacity-0 group-hover:opacity-100 transition p-0.5">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteExpense(e.id)} title="Löschen"
                      className="text-night-500 hover:text-rose-400 sm:opacity-0 group-hover:opacity-100 transition p-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <FilesSection car={car} onChanged={refresh} />

      <Card className="p-5">
        <CardTitle icon={<History size={15} />}>Status-Verlauf</CardTitle>
        <div className="space-y-2.5">
          {car.statusHistory.map((h, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${i === car.statusHistory.length - 1 ? 'bg-emerald-400' : 'bg-night-500'}`} />
              <span className="text-xs text-night-400 w-24 shrink-0">{fmtDate(h.date)}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] border ${statusStyles[h.status] || ''}`}>
                {statusLabels[h.status] || h.status}
              </span>
              {h.note && <span className="text-xs text-night-400 truncate">{h.note}</span>}
            </div>
          ))}
        </div>
      </Card>

      {modal === 'edit' && (
        <CarForm car={car} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      )}
      {modal === 'expense' && (
        <ExpenseForm carId={car.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      )}
      {editingExpense && (
        <ExpenseForm carId={car.id} expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => { setEditingExpense(null); refresh(); }} />
      )}
      {modal === 'sell' && (
        <SellForm car={car} onClose={() => setModal(null)} onSold={() => { setModal(null); refresh(); }} />
      )}
      {modal === 'buy' && (
        <BuyModal car={car} onClose={() => setModal(null)} onBought={() => { setModal(null); refresh(); }} />
      )}
    </div>
  );
}

// "Als gekauft markieren": Kaufpreis abfragen, Status -> purchased, Pot zahlt
function BuyModal({ car, onClose, onBought }: { car: Car; onClose: () => void; onBought: () => void }) {
  const toast = useToast();
  const [price, setPrice] = useState(car.purchasePrice?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = parseFloat(price.replace(',', '.'));
    if (isNaN(p) || p <= 0) { toast('Ungültiger Preis', 'warn'); return; }
    setBusy(true);
    try {
      await api.updateCar(car.id, {
        status: 'purchased',
        statusNote: 'Gekauft',
        purchasePrice: p,
        purchaseFunding: 'pot'
      });
      toast(`Auto gekauft – ${fmtEur(p)} aus dem Pot`);
      onBought();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Als gekauft markieren" icon={<ShoppingCart />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-night-300">
          {car.brand} {car.model} wird in den Bestand übernommen. Der Kaufpreis wird aus dem Pot bezahlt.
        </p>
        <Field label="Kaufpreis (€) *">
          <Input type="number" step="0.01" min="0.01" required autoFocus value={price}
            onChange={e => setPrice(e.target.value)} placeholder="5500" />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Speichern …' : 'Kauf bestätigen'}
        </Button>
      </form>
    </Modal>
  );
}
