// Fahrzeuge: CRUD, Ausgaben, Verkauf, Erstattungen, Foto-/PDF-Uploads
const express = require('express');
const path = require('path');
const fs = require('fs');
const carsRepo = require('../db/cars');
const mapper = require('../lib/carMapper');
const audit = require('../services/audit');
const config = require('../config');
const v = require('../lib/validate');

const router = express.Router();

const STATUSES = ['visited', 'purchased', 'in_progress', 'listed', 'sold'];
const FUNDINGS = ['pot', 'private', 'none'];
const PARTNER_IDS = config.PARTNERS.map(p => p.id);
const EXPENSE_CATEGORIES = ['reparatur', 'tuev', 'zulassung', 'aufbereitung', 'transport',
  'inserat', 'versicherung', 'steuer', 'tanken', 'besichtigung', 'sonstiges'];

function carName(car) {
  return [car.brand, car.model].filter(Boolean).join(' ') || car.id;
}

router.get('/api/cars', (req, res) => {
  res.json(carsRepo.allOrdered().map(mapper.toApi));
});

router.get('/api/cars/:id', (req, res) => {
  const car = carsRepo.get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(mapper.toApi(car));
});

// Gemeinsame Pruefung der frei editierbaren Felder (Anlegen + Bearbeiten)
function validateCarInput(body) {
  const data = {};
  data.brand = v.str(body.brand, 'Marke', { max: 100 });
  data.model = v.str(body.model, 'Modell', { max: 100 });
  data.year = v.optionalNumber(body.year, 'Baujahr', { min: 1900, max: 2100 });
  data.mileage = v.optionalNumber(body.mileage, 'Kilometerstand', { min: 0, max: 5_000_000 });
  data.color = v.str(body.color, 'Farbe', { max: 100 });
  data.fuel = v.str(body.fuel, 'Kraftstoff', { max: 50 });
  data.transmission = v.str(body.transmission, 'Getriebe', { max: 50 });
  data.horsepower = v.optionalNumber(body.horsepower, 'PS', { min: 0, max: 5000 });
  data.vin = v.str(body.vin, 'FIN', { max: 50 });
  data.listedBuyPrice = v.optionalNumber(body.listedBuyPrice, 'Inserierter Preis');
  data.purchasePrice = v.optionalNumber(body.purchasePrice, 'Kaufpreis');
  data.purchaseDate = v.optionalDate(body.purchaseDate, 'Kaufdatum');
  data.targetSellPrice = v.optionalNumber(body.targetSellPrice, 'Zielverkaufspreis');
  data.purchaseFunding = v.oneOf(body.purchaseFunding, FUNDINGS, 'Bezahlung', 'pot');
  data.purchasePaidBy = body.purchaseFunding === 'private'
    ? v.oneOf(body.purchasePaidBy, PARTNER_IDS, 'Bezahlt von')
    : '';
  data.sourcePlatform = v.str(body.sourcePlatform, 'Plattform', { max: 100 });
  data.sourceLink = v.str(body.sourceLink, 'Link', { max: 1000 });
  data.sellerName = v.str(body.sellerName, 'Verkäufer', { max: 200 });
  data.sellerContact = v.str(body.sellerContact, 'Verkäufer-Kontakt', { max: 200 });
  data.previousOwners = v.optionalNumber(body.previousOwners, 'Vorbesitzer', { min: 0, max: 100 });
  data.serviceHistory = v.str(body.serviceHistory, 'Scheckheft', { max: 20 });
  data.lastServiceDate = v.optionalDate(body.lastServiceDate, 'Letzter Service');
  data.lastServiceKm = v.optionalNumber(body.lastServiceKm, 'Service-km', { min: 0, max: 5_000_000 });
  data.notes = v.str(body.notes, 'Notizen', { max: 5000 });
  data.status = v.oneOf(body.status, STATUSES, 'Status', 'purchased');
  return data;
}

router.post('/api/cars', (req, res) => {
  const data = validateCarInput(req.body || {});
  if (!data.brand) v.str(undefined, 'Marke', { required: true });
  if (!data.model) v.str(undefined, 'Modell', { required: true });

  const row = mapper.toDbUpdates(data);
  row.id = 'car_' + Date.now();
  row.purchase_reimbursed = false;
  row.actual_sell_price = null;
  row.sale_date = null;
  row.buyer_name = '';
  row.buyer_contact = '';
  row.listed_sell_price = null;
  row.expenses = [];
  row.status_history = [{ status: data.status, date: new Date().toISOString(), note: 'Auto angelegt' }];
  row.photos = [];
  row.created_at = new Date().toISOString();

  const car = carsRepo.insert(row);
  audit.log(req, 'car.create', car.id, `${carName(car)} angelegt (${data.status})`);
  res.json(mapper.toApi(car));
});

router.put('/api/cars/:id', (req, res) => {
  const existing = carsRepo.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  const body = req.body || {};
  const updates = mapper.toDbUpdates(validateCarInput({
    // Nur uebergebene Felder validieren/aktualisieren (PATCH-Semantik wie bisher)
    ...mapper.toApi(existing),
    ...body
  }));

  // Status History aktualisieren
  if (body.status && body.status !== existing.status) {
    const history = existing.status_history || [];
    history.push({
      status: updates.status,
      date: new Date().toISOString(),
      note: v.str(body.statusNote, 'Status-Notiz', { max: 500 })
    });
    updates.status_history = history;
  }

  const car = carsRepo.update(req.params.id, updates);
  audit.log(req, 'car.update', car.id, `${carName(car)} bearbeitet`);
  res.json(mapper.toApi(car));
});

router.delete('/api/cars/:id', (req, res) => {
  const car = carsRepo.get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  carsRepo.remove(req.params.id);
  audit.log(req, 'car.delete', req.params.id, `${carName(car)} gelöscht`);
  res.json({ success: true });
});

// ── Ausgaben ────────────────────────────────────────────────────────────────

router.post('/api/cars/:id/expenses', (req, res) => {
  const car = carsRepo.get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

  const body = req.body || {};
  const fundingSource = v.oneOf(body.fundingSource, ['pot', 'private'], 'Bezahlt aus', 'pot');
  const expense = {
    id: 'exp_' + Date.now(),
    category: v.oneOf(body.category, EXPENSE_CATEGORIES, 'Kategorie', 'sonstiges'),
    amount: v.amount(body.amount),
    paidBy: fundingSource === 'private' ? v.oneOf(body.paidBy, PARTNER_IDS, 'Bezahlt von') : '',
    fundingSource,
    date: v.optionalDate(body.date, 'Datum', v.today()),
    note: v.str(body.note, 'Notiz', { max: 500 }),
    reimbursed: false,
    createdAt: new Date().toISOString()
  };

  carsRepo.update(req.params.id, { expenses: [...(car.expenses || []), expense] });
  audit.log(req, 'car.expense.add', car.id, `${carName(car)}: ${expense.category} ${expense.amount} €`);
  res.json(expense);
});

router.delete('/api/cars/:carId/expenses/:expId', (req, res) => {
  const car = carsRepo.get(req.params.carId);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

  const removed = (car.expenses || []).find(e => e.id === req.params.expId);
  carsRepo.update(req.params.carId, {
    expenses: (car.expenses || []).filter(e => e.id !== req.params.expId)
  });
  audit.log(req, 'car.expense.delete', car.id,
    `${carName(car)}: Ausgabe ${removed ? removed.amount + ' €' : req.params.expId} gelöscht`);
  res.json({ success: true });
});

router.post('/api/cars/:carId/expenses/:expId/reimburse', (req, res) => {
  const car = carsRepo.get(req.params.carId);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

  const expenses = (car.expenses || []).map(e =>
    e.id === req.params.expId
      ? { ...e, reimbursed: true, reimbursedDate: v.today() }
      : e
  );
  const expense = expenses.find(e => e.id === req.params.expId);
  if (!expense) return res.status(404).json({ error: 'Ausgabe nicht gefunden' });

  carsRepo.update(req.params.carId, { expenses });
  audit.log(req, 'car.expense.reimburse', car.id, `${carName(car)}: ${expense.amount} € erstattet`);
  res.json(expense);
});

router.post('/api/cars/:id/reimburse-purchase', (req, res) => {
  const existing = carsRepo.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
  const car = carsRepo.update(req.params.id, { purchase_reimbursed: true });
  audit.log(req, 'car.purchase.reimburse', car.id, `${carName(car)}: Kaufpreis erstattet`);
  res.json(mapper.toApi(car));
});

// ── Verkauf ─────────────────────────────────────────────────────────────────

router.post('/api/cars/:id/sell', (req, res) => {
  const car = carsRepo.get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

  const body = req.body || {};
  const sellPrice = v.amount(body.actualSellPrice, 'Verkaufspreis');
  const history = car.status_history || [];
  history.push({ status: 'sold', date: new Date().toISOString(), note: 'Verkauft für ' + sellPrice + ' Euro' });

  const updated = carsRepo.update(req.params.id, {
    actual_sell_price: sellPrice,
    sale_date: v.optionalDate(body.saleDate, 'Verkaufsdatum', v.today()),
    buyer_name: v.str(body.buyerName, 'Käufer', { max: 200 }),
    buyer_contact: v.str(body.buyerContact, 'Käufer-Kontakt', { max: 200 }),
    status: 'sold',
    status_history: history
  });
  audit.log(req, 'car.sell', car.id, `${carName(car)} verkauft für ${sellPrice} €`);
  res.json(mapper.toApi(updated));
});

// ── Dateien (Fotos + PDFs, Base64 -> data/uploads/<carId>/) ─────────────────

router.post('/api/cars/:id/photos/upload', (req, res) => {
  const car = carsRepo.get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

  const { imageData, pdfData, fileName, type } = req.body || {};
  const isPdf = type === 'pdf' && pdfData;
  const rawB64 = isPdf ? pdfData : imageData;
  if (!rawB64) return res.status(400).json({ error: 'Keine Datei' });

  const base64 = String(rawB64).replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  const ext = isPdf ? 'pdf' : String(fileName || 'foto.jpg').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const safeFile = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const carDir = path.join(config.UPLOADS_DIR, req.params.id);
  fs.mkdirSync(carDir, { recursive: true });
  fs.writeFileSync(path.join(carDir, safeFile), buffer);

  const publicUrl = `/uploads/${req.params.id}/${safeFile}`;
  // PDFs als "name|pdf|url" speichern, damit das Frontend den Dateinamen kennt
  const safeName = String(fileName || 'Dokument').replace(/[|]/g, '_').replace(/\.pdf$/i, '');
  const storedUrl = isPdf ? `${safeName}|pdf|${publicUrl}` : publicUrl;

  const updated = carsRepo.update(req.params.id, { photos: [...(car.photos || []), storedUrl] });
  audit.log(req, 'car.file.upload', car.id,
    `${carName(car)}: ${isPdf ? 'PDF' : 'Foto'} hochgeladen (${Math.round(buffer.length / 1024)} KB)`);
  res.json(mapper.toApi(updated));
});

router.delete('/api/cars/:id/photos', (req, res) => {
  const car = carsRepo.get(req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

  const { url } = req.body || {};
  // url kann "name|pdf|/uploads/..." oder "/uploads/..." sein
  const rawUrl = url && url.includes('|pdf|') ? url.split('|pdf|')[1] : url;
  const pathPart = rawUrl && rawUrl.split('/uploads/')[1];
  if (pathPart) {
    const filePath = path.resolve(config.UPLOADS_DIR, pathPart);
    // Sicherheitscheck: Pfad muss innerhalb von UPLOADS_DIR liegen
    if (filePath.startsWith(path.resolve(config.UPLOADS_DIR) + path.sep) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (err) { console.error('Datei-Löschfehler:', err.message); }
    }
  }

  const updated = carsRepo.update(req.params.id, {
    photos: (car.photos || []).filter(u => u !== url)
  });
  audit.log(req, 'car.file.delete', car.id, `${carName(car)}: Datei gelöscht`);
  res.json(mapper.toApi(updated));
});

module.exports = router;
