// Formatierung + deutsche Labels/Farben für Status und Kategorien
import type { CarStatus } from './types';

export const fmtEur = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const fmtEurShort = (n: number | null | undefined) => {
  const v = n ?? 0;
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('de-DE') + ' €';
  return fmtEur(v);
};

export const fmtKm = (n: number | null | undefined) =>
  n ? n.toLocaleString('de-DE') + ' km' : '–';

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('de-DE') : '–';

export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';

export const fmtMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short' });
};

export const today = () => new Date().toISOString().slice(0, 10);

export const partnerName = (id: string | null | undefined) =>
  id === 'mert' ? 'Mert' : id === 'tobias' ? 'Tobias' : id === 'both' ? 'Beide' : (id || '–');

export const statusLabels: Record<CarStatus, string> = {
  visited: 'Besichtigt',
  purchased: 'Gekauft',
  in_progress: 'In Aufbereitung',
  listed: 'Inseriert',
  sold: 'Verkauft'
};

// Badge-Stile pro Status (Hintergrund/Schrift/Rand)
export const statusStyles: Record<CarStatus, string> = {
  visited: 'bg-night-600/40 text-night-200 border-night-500/50',
  purchased: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  listed: 'bg-gold-500/15 text-gold-300 border-gold-500/30',
  sold: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
};

export const expenseCategories: Record<string, string> = {
  reparatur: 'Reparatur',
  tuev: 'TÜV / AU',
  zulassung: 'Zulassung',
  aufbereitung: 'Aufbereitung',
  transport: 'Transport',
  inserat: 'Inserat',
  versicherung: 'Versicherung',
  steuer: 'Steuer',
  tanken: 'Tanken',
  besichtigung: 'Besichtigung',
  sonstiges: 'Sonstiges'
};

export const generalCategories: Record<string, string> = {
  server: 'Server / Hosting',
  software: 'Software / Abo',
  werkzeug: 'Werkzeug',
  miete: 'Miete / Stellplatz',
  versicherung: 'Versicherung',
  buero: 'Büro / Material',
  marketing: 'Marketing',
  gebuehren: 'Gebühren',
  sonstiges: 'Sonstiges'
};

export const auditActionLabels: Record<string, string> = {
  'auth.login': 'Anmeldung',
  'car.create': 'Auto angelegt',
  'car.update': 'Auto bearbeitet',
  'car.delete': 'Auto gelöscht',
  'car.sell': 'Auto verkauft',
  'car.expense.add': 'Ausgabe erfasst',
  'car.expense.delete': 'Ausgabe gelöscht',
  'car.expense.reimburse': 'Erstattung',
  'car.purchase.reimburse': 'Kaufpreis erstattet',
  'car.file.upload': 'Datei hochgeladen',
  'car.file.delete': 'Datei gelöscht',
  'pot.deposit': 'Pot-Einzahlung',
  'pot.withdraw': 'Pot-Entnahme',
  'pot.transaction.delete': 'Pot-Buchung gelöscht',
  'overhead.create': 'Kosten erfasst',
  'overhead.delete': 'Kosten gelöscht',
  'overhead.reimburse': 'Kosten erstattet',
  'recurring.create': 'Dauerauftrag angelegt',
  'recurring.stop': 'Dauerauftrag gestoppt',
  'recurring.delete': 'Dauerauftrag gelöscht'
};
