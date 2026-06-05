// ─── Migration: Supabase-CSV-Export → lokale SQLite-DB ───────────────────────
// Liest cars.csv (Postgres json_agg-Export) und pot.csv (normales CSV) ein und
// importiert sie idempotent (INSERT OR REPLACE) in die SQLite-Datenbank.
//
// Aufruf:  node migrate.js
// Optional: andere Pfade per ENV CARS_CSV / POT_CSV

const fs = require('fs');
const path = require('path');
const db = require('./db');

db.initSchema();

const CARS_CSV = process.env.CARS_CSV || path.join(__dirname, 'cars.csv');
const POT_CSV  = process.env.POT_CSV  || path.join(__dirname, 'pot.csv');

// ─── Mini-CSV-Parser (RFC-4180-konform genug) ────────────────────────────────
// Gibt ein Array von Zeilen zurück, jede Zeile ein Array von Feldern.
// Behandelt "..." quoting, ""-Escapes und Kommas/Newlines innerhalb von Quotes.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // führendes BOM entfernen
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // letztes Feld/Zeile (falls kein abschließendes Newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Hilfsfunktion: Wert ist evtl. JSON-String oder schon Array/Objekt → Array
function ensureArray(val) {
  if (val == null || val === '') return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

// Leere Strings/undefined → null (für numerische/optionale Spalten)
function nn(v) {
  return v === '' || v === undefined ? null : v;
}

// ─── cars.csv einlesen ───────────────────────────────────────────────────────
function readCars() {
  if (!fs.existsSync(CARS_CSV)) {
    console.warn(`⚠️  ${CARS_CSV} nicht gefunden – überspringe Autos.`);
    return [];
  }
  const text = fs.readFileSync(CARS_CSV, 'utf8');
  const rows = parseCSV(text);
  if (rows.length === 0) return [];

  // Erwartetes Format: Header ["json_agg"], danach EIN Feld mit dem JSON-Array.
  // Wir suchen das erste Feld, das wie ein JSON-Array aussieht.
  let jsonText = null;
  for (const r of rows) {
    for (const f of r) {
      const t = (f || '').trim();
      if (t.startsWith('[') && t.endsWith(']')) { jsonText = t; break; }
    }
    if (jsonText) break;
  }

  if (!jsonText) {
    throw new Error('cars.csv: konnte kein JSON-Array finden (unerwartetes Format).');
  }

  const arr = JSON.parse(jsonText);
  return Array.isArray(arr) ? arr : [];
}

// ─── pot.csv einlesen ────────────────────────────────────────────────────────
function readPot() {
  if (!fs.existsSync(POT_CSV)) {
    console.warn(`⚠️  ${POT_CSV} nicht gefunden – überspringe Transaktionen.`);
    return [];
  }
  const text = fs.readFileSync(POT_CSV, 'utf8');
  const rows = parseCSV(text).filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx]; });
    return obj;
  });
}

// ─── Import ──────────────────────────────────────────────────────────────────
const insertCarStmt = db.db.prepare(`
  INSERT OR REPLACE INTO cars (
    id, brand, model, year, mileage, color, fuel, transmission, horsepower, vin,
    listed_buy_price, purchase_price, purchase_funding, purchase_paid_by, purchase_reimbursed,
    target_sell_price, listed_sell_price, actual_sell_price, purchase_date, sale_date,
    source_platform, source_link, seller_name, seller_contact, buyer_name, buyer_contact,
    status, notes, expenses, status_history, photos, created_at
  ) VALUES (
    @id, @brand, @model, @year, @mileage, @color, @fuel, @transmission, @horsepower, @vin,
    @listed_buy_price, @purchase_price, @purchase_funding, @purchase_paid_by, @purchase_reimbursed,
    @target_sell_price, @listed_sell_price, @actual_sell_price, @purchase_date, @sale_date,
    @source_platform, @source_link, @seller_name, @seller_contact, @buyer_name, @buyer_contact,
    @status, @notes, @expenses, @status_history, @photos, @created_at
  )
`);

const insertPotStmt = db.db.prepare(`
  INSERT OR REPLACE INTO pot_transactions (id, type, amount, partner_id, date, note, created_at)
  VALUES (@id, @type, @amount, @partner_id, @date, @note, @created_at)
`);

function carToRow(c) {
  return {
    id: c.id,
    brand: c.brand ?? '',
    model: c.model ?? '',
    year: nn(c.year),
    mileage: nn(c.mileage),
    color: c.color ?? '',
    fuel: c.fuel ?? '',
    transmission: c.transmission ?? '',
    horsepower: nn(c.horsepower),
    vin: c.vin ?? '',
    listed_buy_price: nn(c.listed_buy_price),
    purchase_price: nn(c.purchase_price),
    purchase_funding: c.purchase_funding ?? 'pot',
    purchase_paid_by: c.purchase_paid_by ?? '',
    purchase_reimbursed: c.purchase_reimbursed ? 1 : 0,
    target_sell_price: nn(c.target_sell_price),
    listed_sell_price: nn(c.listed_sell_price),
    actual_sell_price: nn(c.actual_sell_price),
    purchase_date: nn(c.purchase_date),
    sale_date: nn(c.sale_date),
    source_platform: c.source_platform ?? '',
    source_link: c.source_link ?? '',
    seller_name: c.seller_name ?? '',
    seller_contact: c.seller_contact ?? '',
    buyer_name: c.buyer_name ?? '',
    buyer_contact: c.buyer_contact ?? '',
    status: c.status ?? 'purchased',
    notes: c.notes ?? '',
    expenses: JSON.stringify(ensureArray(c.expenses)),
    status_history: JSON.stringify(ensureArray(c.status_history)),
    photos: JSON.stringify(ensureArray(c.photos)),
    created_at: nn(c.created_at) || new Date().toISOString()
  };
}

function potToRow(t) {
  return {
    id: t.id,
    type: t.type ?? 'deposit',
    amount: t.amount === '' || t.amount == null ? 0 : Number(t.amount),
    partner_id: t.partner_id ?? '',
    date: nn(t.date),
    note: t.note ?? '',
    created_at: nn(t.created_at) || new Date().toISOString()
  };
}

function main() {
  console.log('📥 Lese CSV-Dateien …');
  const cars = readCars();
  const pot  = readPot();

  console.log(`   cars.csv:  ${cars.length} Auto-Datensätze gefunden`);
  console.log(`   pot.csv:   ${pot.length} Transaktionen gefunden`);

  const importCars = db.db.transaction((list) => {
    for (const c of list) {
      if (!c.id) { console.warn('   ⚠️  Auto ohne id übersprungen'); continue; }
      insertCarStmt.run(carToRow(c));
    }
  });
  const importPot = db.db.transaction((list) => {
    for (const t of list) {
      if (!t.id) { console.warn('   ⚠️  Transaktion ohne id übersprungen'); continue; }
      insertPotStmt.run(potToRow(t));
    }
  });

  importCars(cars);
  importPot(pot);

  const carCount = db.db.prepare('SELECT COUNT(*) AS n FROM cars').get().n;
  const potCount = db.db.prepare('SELECT COUNT(*) AS n FROM pot_transactions').get().n;

  console.log('');
  console.log('✅ Migration abgeschlossen.');
  console.log(`   🚗 Autos in DB:          ${carCount}`);
  console.log(`   💰 Pot-Transaktionen:    ${potCount}`);
  console.log(`   🗄️  Datenbank:            ${db.DB_PATH}`);
}

main();
