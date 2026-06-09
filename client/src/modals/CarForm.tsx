import { useState, type FormEvent } from 'react';
import { CarFront } from 'lucide-react';
import { api } from '../api';
import { today } from '../format';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea, Segmented } from '../ui/Field';
import { useToast } from '../ui/Toast';
import type { Car, CarStatus } from '../types';

interface Props {
  car?: Car; // gesetzt = Bearbeiten
  onClose: () => void;
  onSaved: (car: Car) => void;
}

const num = (v: string) => (v === '' ? null : parseFloat(v));
const int = (v: string) => (v === '' ? null : parseInt(v, 10));

export function CarForm({ car, onClose, onSaved }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    status: (car?.status ?? 'visited') as CarStatus,
    brand: car?.brand ?? '',
    model: car?.model ?? '',
    year: car?.year?.toString() ?? '',
    mileage: car?.mileage?.toString() ?? '',
    color: car?.color ?? '',
    horsepower: car?.horsepower?.toString() ?? '',
    fuel: car?.fuel ?? '',
    transmission: car?.transmission ?? '',
    vin: car?.vin ?? '',
    previousOwners: car?.previousOwners?.toString() ?? '',
    serviceHistory: car?.serviceHistory ?? '',
    lastServiceDate: car?.lastServiceDate ?? '',
    lastServiceKm: car?.lastServiceKm?.toString() ?? '',
    listedBuyPrice: car?.listedBuyPrice?.toString() ?? '',
    purchasePrice: car?.purchasePrice?.toString() ?? '',
    purchaseDate: car?.purchaseDate ?? today(),
    targetSellPrice: car?.targetSellPrice?.toString() ?? '',
    purchaseFunding: car?.purchaseFunding === 'private' ? 'private' : 'pot',
    purchasePaidBy: car?.purchasePaidBy || 'mert',
    sourcePlatform: car?.sourcePlatform ?? '',
    sourceLink: car?.sourceLink ?? '',
    sellerName: car?.sellerName ?? '',
    sellerContact: car?.sellerContact ?? '',
    notes: car?.notes ?? ''
  });

  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF(prev => ({ ...prev, [key]: e.target.value }));

  const isVisited = f.status === 'visited';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = {
        status: f.status,
        brand: f.brand,
        model: f.model,
        year: int(f.year),
        mileage: int(f.mileage),
        color: f.color,
        horsepower: int(f.horsepower),
        fuel: f.fuel,
        transmission: f.transmission,
        vin: f.vin,
        previousOwners: int(f.previousOwners),
        serviceHistory: f.serviceHistory,
        lastServiceDate: f.lastServiceDate || null,
        lastServiceKm: int(f.lastServiceKm),
        listedBuyPrice: num(f.listedBuyPrice),
        purchasePrice: num(f.purchasePrice),
        purchaseDate: f.purchaseDate || null,
        targetSellPrice: num(f.targetSellPrice),
        purchaseFunding: (isVisited ? 'none' : f.purchaseFunding) as Car['purchaseFunding'],
        purchasePaidBy: !isVisited && f.purchaseFunding === 'private' ? f.purchasePaidBy : '',
        sourcePlatform: f.sourcePlatform,
        sourceLink: f.sourceLink,
        sellerName: f.sellerName,
        sellerContact: f.sellerContact,
        notes: f.notes
      };
      const saved = car ? await api.updateCar(car.id, data) : await api.createCar(data);
      toast(car ? 'Auto aktualisiert' : isVisited ? 'Besichtigung gespeichert' : 'Auto hinzugefügt');
      onSaved(saved);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  }

  const section = 'text-[11px] font-semibold text-night-400 uppercase tracking-wider pt-2';

  return (
    <Modal title={car ? 'Auto bearbeiten' : 'Neues Auto'} icon={<CarFront />} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Status">
          <Select value={f.status} onChange={set('status')}>
            <option value="visited">Besichtigt</option>
            <option value="purchased">Gekauft</option>
            <option value="in_progress">In Aufbereitung</option>
            <option value="listed">Inseriert</option>
            {car?.status === 'sold' && <option value="sold">Verkauft</option>}
          </Select>
        </Field>

        <div className={section}>Fahrzeug</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marke *"><Input required value={f.brand} onChange={set('brand')} placeholder="BMW" /></Field>
          <Field label="Modell *"><Input required value={f.model} onChange={set('model')} placeholder="320i" /></Field>
          <Field label="Baujahr"><Input type="number" value={f.year} onChange={set('year')} placeholder="2019" /></Field>
          <Field label="Kilometerstand"><Input type="number" value={f.mileage} onChange={set('mileage')} placeholder="85000" /></Field>
          <Field label="Farbe"><Input value={f.color} onChange={set('color')} placeholder="Schwarz" /></Field>
          <Field label="PS"><Input type="number" value={f.horsepower} onChange={set('horsepower')} placeholder="184" /></Field>
          <Field label="Kraftstoff">
            <Select value={f.fuel} onChange={set('fuel')}>
              <option value="">–</option><option>Benzin</option><option>Diesel</option>
              <option>Elektro</option><option>Hybrid</option><option>LPG</option>
            </Select>
          </Field>
          <Field label="Getriebe">
            <Select value={f.transmission} onChange={set('transmission')}>
              <option value="">–</option><option>Automatik</option><option>Schaltung</option>
            </Select>
          </Field>
        </div>
        <Field label="FIN (Fahrgestellnummer)">
          <Input value={f.vin} onChange={set('vin')} placeholder="WBAXXXXXXXX" className="font-mono" />
        </Field>

        <div className={section}>Historie &amp; Zustand</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorbesitzer"><Input type="number" min="0" value={f.previousOwners} onChange={set('previousOwners')} placeholder="2" /></Field>
          <Field label="Scheckheftgepflegt">
            <Select value={f.serviceHistory} onChange={set('serviceHistory')}>
              <option value="">–</option><option value="ja">Ja</option><option value="nein">Nein</option>
            </Select>
          </Field>
          <Field label="Letzter Service (Datum)"><Input type="date" value={f.lastServiceDate} onChange={set('lastServiceDate')} /></Field>
          <Field label="Letzter Service bei (km)"><Input type="number" min="0" value={f.lastServiceKm} onChange={set('lastServiceKm')} placeholder="85000" /></Field>
        </div>

        <div className={section}>Preise</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inserierter Preis"><Input type="number" step="0.01" value={f.listedBuyPrice} onChange={set('listedBuyPrice')} placeholder="6500" /></Field>
          <Field label={isVisited ? 'Vorstellungspreis' : 'Kaufpreis'}>
            <Input type="number" step="0.01" value={f.purchasePrice} onChange={set('purchasePrice')} placeholder="5500" />
          </Field>
          <Field label="Kaufdatum"><Input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></Field>
          <Field label="Zielverkaufspreis"><Input type="number" step="0.01" value={f.targetSellPrice} onChange={set('targetSellPrice')} placeholder="7500" /></Field>
        </div>

        {!isVisited && (
          <>
            <div className={section}>Bezahlung</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bezahlt aus">
                <Segmented
                  value={f.purchaseFunding as 'pot' | 'private'}
                  onChange={v => setF(p => ({ ...p, purchaseFunding: v }))}
                  options={[{ value: 'pot', label: 'Pot' }, { value: 'private', label: 'Privat' }]}
                />
              </Field>
              {f.purchaseFunding === 'private' && (
                <Field label="Bezahlt von">
                  <Segmented
                    value={f.purchasePaidBy as 'mert' | 'tobias'}
                    onChange={v => setF(p => ({ ...p, purchasePaidBy: v }))}
                    options={[{ value: 'mert', label: 'Mert' }, { value: 'tobias', label: 'Tobias' }]}
                  />
                </Field>
              )}
            </div>
          </>
        )}

        <div className={section}>Quelle &amp; Kontakt</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plattform">
            <Select value={f.sourcePlatform} onChange={set('sourcePlatform')}>
              <option value="">–</option><option>Mobile.de</option><option>AutoScout24</option>
              <option>eBay Kleinanzeigen</option><option>Facebook</option><option>Privat</option><option>Sonstiges</option>
            </Select>
          </Field>
          <Field label="Link zum Inserat"><Input value={f.sourceLink} onChange={set('sourceLink')} placeholder="https://…" /></Field>
          <Field label="Verkäufer Name"><Input value={f.sellerName} onChange={set('sellerName')} /></Field>
          <Field label="Verkäufer Kontakt"><Input value={f.sellerContact} onChange={set('sellerContact')} placeholder="Tel / E-Mail" /></Field>
        </div>

        <Field label="Notizen">
          <Textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Zusätzliche Infos …" />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" className="flex-1" disabled={busy}>
            {busy ? 'Speichern …' : 'Speichern'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
        </div>
      </form>
    </Modal>
  );
}
