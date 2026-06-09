import { useRef, useState, type FormEvent } from 'react';
import { Banknote, Fuel, MapPin, Flag, Route, Check } from 'lucide-react';
import { api } from '../api';
import { expenseCategories, fmtEur, today } from '../format';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select, Segmented } from '../ui/Field';
import { useToast } from '../ui/Toast';

interface Suggestion { lat: string; lon: string; label: string; detail: string }
interface Coords { lat: number; lon: number }

// Adresssuche (Nominatim) für den Tankkosten-Rechner
async function searchAddress(q: string): Promise<Suggestion[]> {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
  const data = await res.json();
  return (data as any[]).map(item => {
    const a = item.address || {};
    const parts: string[] = [];
    if (a.road) parts.push(a.road + (a.house_number ? ' ' + a.house_number : ''));
    const city = a.city || a.town || a.village || a.municipality;
    if (city) parts.push(city);
    if (a.state) parts.push(a.state);
    return {
      lat: item.lat,
      lon: item.lon,
      label: parts.length ? parts.join(', ') : String(item.display_name).split(',').slice(0, 2).join(','),
      detail: item.display_name
    };
  });
}

function AddressInput({ label, icon, onSelect }: {
  label: string;
  icon: React.ReactNode;
  onSelect: (c: Coords) => void;
}) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function onChange(v: string) {
    setValue(v);
    clearTimeout(timer.current);
    if (v.trim().length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        setSuggestions(await searchAddress(v.trim()));
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }

  return (
    <div className="relative">
      <Field label={label}>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-night-400 [&>svg]:w-[14px] [&>svg]:h-[14px]">{icon}</span>
          <Input value={value} onChange={e => onChange(e.target.value)} className="pl-9" placeholder="Adresse eingeben …" autoComplete="off" />
        </div>
      </Field>
      {suggestions.length > 0 && (
        <div className="absolute z-20 inset-x-0 top-full mt-1 bg-night-700 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                setValue(s.label);
                setSuggestions([]);
                onSelect({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
              }}
              className="w-full text-left px-3.5 py-2.5 hover:bg-night-600 transition-colors border-b border-white/[0.05] last:border-0"
            >
              <div className="text-sm font-medium text-night-100">{s.label}</div>
              <div className="text-[11px] text-night-400 truncate">{s.detail}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpenseForm({ carId, onClose, onSaved }: {
  carId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    category: 'reparatur',
    amount: '',
    fundingSource: 'pot' as 'pot' | 'private',
    paidBy: 'mert' as 'mert' | 'tobias',
    date: today(),
    note: ''
  });

  // Tankrechner
  const [start, setStart] = useState<Coords | null>(null);
  const [end, setEnd] = useState<Coords | null>(null);
  const [roundtrip, setRoundtrip] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [verbrauch, setVerbrauch] = useState('');
  const [preis, setPreis] = useState('');

  const tankKosten =
    distanceKm && parseFloat(verbrauch) && parseFloat(preis)
      ? (distanceKm / 100) * parseFloat(verbrauch) * parseFloat(preis)
      : 0;

  async function berechneStrecke() {
    if (!start || !end) { toast('Bitte beide Adressen auswählen', 'warn'); return; }
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.routes?.[0]) { toast('Route nicht gefunden', 'error'); return; }
      let km = data.routes[0].distance / 1000;
      if (roundtrip) km *= 2;
      setDistanceKm(km);
    } catch {
      toast('Fehler bei der Routenberechnung', 'error');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addExpense(carId, {
        category: f.category,
        amount: parseFloat(f.amount) || 0,
        fundingSource: f.fundingSource,
        paidBy: f.fundingSource === 'private' ? f.paidBy : '',
        date: f.date,
        note: f.note
      });
      toast('Ausgabe hinzugefügt');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Ausgabe hinzufügen" icon={<Banknote />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Kategorie">
          <Select value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))}>
            {Object.entries(expenseCategories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>

        {f.category === 'tanken' && (
          <div className="bg-night-700/40 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
              <Fuel size={15} /> Tankkosten-Rechner
              <span className="ml-auto text-[11px] text-night-400 font-normal">optional</span>
            </div>
            <AddressInput label="Startadresse" icon={<MapPin />} onSelect={setStart} />
            <AddressInput label="Zieladresse" icon={<Flag />} onSelect={setEnd} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRoundtrip(r => !r)}
                className={`px-3.5 py-2 rounded-xl border text-sm transition-colors ${
                  roundtrip
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-night-700/70 border-white/[0.08] text-night-300'
                }`}
              >
                Hin &amp; zurück
              </button>
              <Button type="button" variant="ghost" className="flex-1" onClick={berechneStrecke}>
                <Route size={15} /> Strecke berechnen
              </Button>
            </div>
            {distanceKm > 0 && (
              <div className="flex justify-between items-center bg-night-800/80 rounded-xl px-3.5 py-2.5 text-sm">
                <span className="text-night-400">Strecke</span>
                <span className="font-semibold text-amber-300">
                  {distanceKm.toFixed(1)} km{roundtrip ? ' (hin & zurück)' : ''}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Verbrauch (l/100 km)">
                <Input type="number" step="0.1" min="0" value={verbrauch} onChange={e => setVerbrauch(e.target.value)} placeholder="8,5" />
              </Field>
              <Field label="Preis pro Liter (€)">
                <Input type="number" step="0.001" min="0" value={preis} onChange={e => setPreis(e.target.value)} placeholder="1,799" />
              </Field>
            </div>
            {tankKosten > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3.5">
                <div className="flex justify-between items-center mb-2.5 text-sm">
                  <span className="text-night-300">Geschätzte Tankkosten</span>
                  <span className="font-display font-bold text-amber-300">{fmtEur(tankKosten)}</span>
                </div>
                <Button
                  type="button"
                  variant="warn"
                  className="w-full"
                  onClick={() => setF(p => ({ ...p, amount: tankKosten.toFixed(2) }))}
                >
                  <Check size={15} /> Betrag übernehmen
                </Button>
              </div>
            )}
          </div>
        )}

        <Field label="Betrag (€) *">
          <Input type="number" step="0.01" min="0.01" required value={f.amount}
            onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="250,00" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bezahlt aus">
            <Segmented
              value={f.fundingSource}
              onChange={v => setF(p => ({ ...p, fundingSource: v }))}
              options={[{ value: 'pot', label: 'Pot' }, { value: 'private', label: 'Privat' }]}
            />
          </Field>
          {f.fundingSource === 'private' && (
            <Field label="Bezahlt von">
              <Segmented
                value={f.paidBy}
                onChange={v => setF(p => ({ ...p, paidBy: v }))}
                options={[{ value: 'mert', label: 'Mert' }, { value: 'tobias', label: 'Tobias' }]}
              />
            </Field>
          )}
        </div>

        <Field label="Datum">
          <Input type="date" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} />
        </Field>
        <Field label="Notiz">
          <Input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} placeholder="z.B. Fahrtkosten zur Besichtigung" />
        </Field>

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? 'Speichern …' : 'Ausgabe speichern'}
        </Button>
      </form>
    </Modal>
  );
}
