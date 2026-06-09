import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Repeat, Receipt, Trash2, Check, OctagonPause, Pencil } from 'lucide-react';
import { api } from '../api';
import { fmtDate, fmtEur, generalCategories, partnerName, today } from '../format';
import { Card, CardTitle, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input, Select, Segmented } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { Empty, Spinner } from '../ui/Misc';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/Confirm';
import { useRefresh } from '../refresh';
import type { GeneralExpense, GeneralExpensesResponse } from '../types';

export function Costs() {
  const toast = useToast();
  const confirm = useConfirm();
  const { tick, bump } = useRefresh();
  const [data, setData] = useState<GeneralExpensesResponse | null>(null);
  const [modal, setModal] = useState<'expense' | 'recurring' | null>(null);
  const [editing, setEditing] = useState<GeneralExpense | null>(null);

  useEffect(() => {
    api.generalExpenses().then(setData).catch(() => {});
  }, [tick]);

  if (!data) return <Spinner />;

  const open = data.expenses
    .filter(e => e.funding_source === 'private' && !e.reimbursed)
    .reduce((s, e) => s + e.amount, 0);
  const activeRules = data.recurring.filter(r => r.active);

  async function deleteExpense(id: string) {
    const ok = await confirm({ title: 'Kostenbuchung löschen?', danger: true, confirmLabel: 'Löschen' });
    if (!ok) return;
    await api.deleteGeneralExpense(id);
    toast('Buchung gelöscht');
    bump();
  }

  async function reimburse(id: string) {
    const ok = await confirm({ title: 'Erstattung als erledigt markieren?', confirmLabel: 'Erstattet' });
    if (!ok) return;
    await api.reimburseGeneralExpense(id);
    toast('Erstattung markiert');
    bump();
  }

  async function stopRule(id: string) {
    const ok = await confirm({
      title: 'Dauerauftrag stoppen?',
      message: 'Bisherige Buchungen bleiben erhalten, es werden nur keine neuen Monate mehr gebucht.',
      confirmLabel: 'Stoppen'
    });
    if (!ok) return;
    await api.stopRecurring(id);
    toast('Dauerauftrag gestoppt');
    bump();
  }

  async function deleteRule(id: string) {
    const withBookings = await confirm({
      title: 'Dauerauftrag löschen',
      message: 'Sollen auch alle automatisch erzeugten Buchungen entfernt werden (komplett rückgängig)?\n\n„Nur Regel" behält die gebuchten Monate.',
      confirmLabel: 'Inkl. Buchungen',
      danger: true
    });
    if (withBookings) {
      const sure = await confirm({
        title: 'Wirklich ALLE automatischen Buchungen löschen?',
        danger: true,
        confirmLabel: 'Ja, alles löschen'
      });
      if (!sure) return;
      await api.deleteRecurring(id, true);
      toast('Dauerauftrag + Buchungen gelöscht');
    } else {
      const onlyRule = await confirm({
        title: 'Nur die Regel löschen?',
        message: 'Bereits gebuchte Monate bleiben erhalten.',
        confirmLabel: 'Regel löschen'
      });
      if (!onlyRule) return;
      await api.deleteRecurring(id, false);
      toast('Regel gelöscht (Buchungen behalten)');
    }
    bump();
  }

  return (
    <div className="rise space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Allgemeine Kosten</h1>
          <p className="text-sm text-night-400 mt-0.5">Betriebskosten ohne Auto-Bezug (Server, Werkzeug, Miete …)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setModal('recurring')}>
            <Repeat size={15} /> Monatlich
          </Button>
          <Button variant="primary" onClick={() => setModal('expense')}>
            <Plus size={15} /> Kosten erfassen
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Betriebskosten gesamt" value={fmtEur(data.totalOverhead)} tone="negative" />
        <StatCard label="Davon offen (privat)" value={fmtEur(open)} tone={open > 0 ? 'warn' : 'default'} />
        <StatCard label="Aktive Daueraufträge" value={String(activeRules.length)} tone="gold"
          sub={activeRules.length > 0 ? fmtEur(activeRules.reduce((s, r) => s + r.amount, 0)) + ' / Monat' : undefined} />
      </div>

      <Card className="p-5">
        <CardTitle icon={<Repeat size={15} />}>Monatliche Daueraufträge</CardTitle>
        {data.recurring.length === 0 ? (
          <p className="text-night-400 text-sm text-center py-5">Keine monatlichen Kosten eingerichtet</p>
        ) : (
          <div className="space-y-2">
            {data.recurring.map(r => (
              <div key={r.id} className={`flex items-center justify-between gap-3 bg-night-700/40 rounded-xl px-4 py-3 group ${r.active ? '' : 'opacity-50'}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {generalCategories[r.category] || r.category}
                    {r.note ? <span className="text-night-400"> · {r.note}</span> : ''}
                  </div>
                  <div className="text-[11px] text-night-400">
                    jeden {r.day_of_month}. · {r.funding_source === 'pot' ? 'Pot' : partnerName(r.paid_by)}
                    {!r.active && <span className="text-rose-400"> · gestoppt</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-display font-semibold text-sm">{fmtEur(r.amount)}<span className="text-night-400 font-sans text-xs">/Mon.</span></span>
                  {r.active && (
                    <button onClick={() => stopRule(r.id)} title="Stoppen"
                      className="text-[11px] bg-amber-500/15 text-amber-300 px-2 py-1 rounded-lg hover:bg-amber-500/25 transition-colors inline-flex items-center gap-1">
                      <OctagonPause size={12} /> Stopp
                    </button>
                  )}
                  <button onClick={() => deleteRule(r.id)}
                    className="text-night-500 hover:text-rose-400 sm:opacity-0 group-hover:opacity-100 transition p-0.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <CardTitle>Buchungen</CardTitle>
        {data.expenses.length === 0 ? (
          <Empty icon={<Receipt />} text="Noch keine Kosten erfasst" />
        ) : (
          <div className="space-y-2">
            {data.expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-3 bg-night-700/40 rounded-xl px-4 py-3 group">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {generalCategories[e.category] || e.category}
                    {e.auto_generated && (
                      <span className="ml-1.5 text-[10px] text-gold-300 bg-gold-500/10 border border-gold-500/20 px-1.5 py-0.5 rounded-md align-middle">
                        auto
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-night-400 truncate">
                    {fmtDate(e.date)} · {e.funding_source === 'pot' ? 'Pot' : partnerName(e.paid_by)}
                    {e.note ? ' · ' + e.note : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-display font-semibold text-sm text-rose-400">−{fmtEur(e.amount)}</span>
                  {e.funding_source === 'private' && !e.reimbursed && (
                    <button onClick={() => reimburse(e.id)}
                      className="text-[11px] bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-lg hover:bg-amber-500/25 transition-colors">
                      Offen
                    </button>
                  )}
                  {e.reimbursed && <Check size={14} className="text-emerald-400" />}
                  <button onClick={() => setEditing(e)} title="Bearbeiten"
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

      {modal === 'expense' && (
        <GeneralExpenseModal onClose={() => setModal(null)} onSaved={() => { setModal(null); bump(); }} />
      )}
      {editing && (
        <GeneralExpenseModal expense={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); bump(); }} />
      )}
      {modal === 'recurring' && (
        <RecurringModal onClose={() => setModal(null)} onSaved={() => { setModal(null); bump(); }} />
      )}
    </div>
  );
}

function GeneralExpenseModal({ expense, onClose, onSaved }: {
  expense?: GeneralExpense; // gesetzt = bestehende Buchung bearbeiten
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    category: expense?.category ?? 'server',
    amount: expense?.amount.toString() ?? '',
    fundingSource: (expense?.funding_source ?? 'pot') as 'pot' | 'private',
    paidBy: (expense?.paid_by === 'tobias' ? 'tobias' : 'mert') as 'mert' | 'tobias',
    date: expense?.date ?? today(),
    note: expense?.note ?? ''
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = {
        category: f.category,
        amount: parseFloat(f.amount) || 0,
        fundingSource: f.fundingSource,
        paidBy: f.paidBy,
        date: f.date,
        note: f.note
      };
      if (expense) {
        await api.updateGeneralExpense(expense.id, data);
      } else {
        await api.createGeneralExpense(data);
      }
      toast(expense ? 'Buchung aktualisiert' : 'Kosten erfasst');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler beim Speichern', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={expense ? 'Buchung bearbeiten' : 'Allgemeine Kosten erfassen'} icon={<Receipt />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Kategorie">
          <Select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            {Object.entries(generalCategories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Betrag (€) *">
          <Input type="number" step="0.01" min="0.01" required value={f.amount}
            onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="29,99" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bezahlt aus">
            <Segmented value={f.fundingSource} onChange={v => setF(p => ({ ...p, fundingSource: v }))}
              options={[{ value: 'pot', label: 'Pot' }, { value: 'private', label: 'Privat' }]} />
          </Field>
          {f.fundingSource === 'private' && (
            <Field label="Bezahlt von">
              <Segmented value={f.paidBy} onChange={v => setF(p => ({ ...p, paidBy: v }))}
                options={[{ value: 'mert', label: 'Mert' }, { value: 'tobias', label: 'Tobias' }]} />
            </Field>
          )}
        </div>
        <Field label="Datum">
          <Input type="date" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} />
        </Field>
        <Field label="Notiz">
          <Input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} placeholder="z.B. Hetzner Server Juni" />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Speichern …' : expense ? 'Änderungen speichern' : 'Kosten speichern'}
        </Button>
      </form>
    </Modal>
  );
}

function RecurringModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    category: 'server', amount: '', fundingSource: 'pot' as 'pot' | 'private',
    paidBy: 'mert' as 'mert' | 'tobias', startDate: today(), dayOfMonth: '1', note: ''
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createRecurring({
        category: f.category,
        amount: parseFloat(f.amount) || 0,
        fundingSource: f.fundingSource,
        paidBy: f.paidBy,
        startDate: f.startDate,
        dayOfMonth: parseInt(f.dayOfMonth, 10) || 1,
        note: f.note
      });
      toast('Dauerauftrag angelegt');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler beim Speichern', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Monatliche Kosten einrichten" icon={<Repeat />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="bg-gold-500/8 border border-gold-500/20 rounded-xl p-3.5 text-xs text-night-200">
          Wird ab dem Startdatum <b>jeden Monat automatisch</b> als Kosten gebucht – auch rückwirkend nachgeholt.
          Der Dauerauftrag lässt sich jederzeit stoppen.
        </div>
        <Field label="Kategorie">
          <Select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            {Object.entries(generalCategories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Betrag pro Monat (€) *">
          <Input type="number" step="0.01" min="0.01" required value={f.amount}
            onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="29,99" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bezahlt aus">
            <Segmented value={f.fundingSource} onChange={v => setF(p => ({ ...p, fundingSource: v }))}
              options={[{ value: 'pot', label: 'Pot' }, { value: 'private', label: 'Privat' }]} />
          </Field>
          {f.fundingSource === 'private' && (
            <Field label="Bezahlt von">
              <Segmented value={f.paidBy} onChange={v => setF(p => ({ ...p, paidBy: v }))}
                options={[{ value: 'mert', label: 'Mert' }, { value: 'tobias', label: 'Tobias' }]} />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Startdatum">
            <Input type="date" value={f.startDate} onChange={e => setF(p => ({ ...p, startDate: e.target.value }))} />
          </Field>
          <Field label="Tag im Monat (1–28)">
            <Input type="number" min="1" max="28" value={f.dayOfMonth}
              onChange={e => setF(p => ({ ...p, dayOfMonth: e.target.value }))} />
          </Field>
        </div>
        <Field label="Notiz">
          <Input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} placeholder="z.B. Hetzner Server" />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Speichern …' : 'Dauerauftrag anlegen'}
        </Button>
      </form>
    </Modal>
  );
}
