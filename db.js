// ─── SQLite-Datenbank-Layer (better-sqlite3) ────────────────────────────────
// Ersetzt Supabase. Gibt Zeilen im selben Format zurück, wie es Supabase tat:
//   - JSON-Felder (expenses, status_history, photos) als geparste Arrays/Objekte
//   - Boolean-Felder (purchase_reimbursed) als echte true/false
// Dadurch bleibt der restliche Code in server.js unverändert nutzbar.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Datenverzeichnis ist per ENV überschreibbar (im Docker-Container = /app/data)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'autotracker.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // robuster bei parallelen Zugriffen

// ─── Schema ──────────────────────────────────────────────────────────────────

// Fehlende Spalten an bestehende Tabellen anhaengen (idempotent, datenerhaltend).
// CREATE TABLE IF NOT EXISTS legt bei bestehender DB keine neuen Spalten an,
// daher hier per ALTER TABLE nachziehen.
function ensureColumns(table, cols) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const [name, type] of Object.entries(cols)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cars (
      id                  TEXT PRIMARY KEY,
      brand               TEXT,
      model               TEXT,
      year                INTEGER,
      mileage             INTEGER,
      color               TEXT,
      fuel                TEXT,
      transmission        TEXT,
      horsepower          INTEGER,
      vin                 TEXT,
      listed_buy_price    REAL,
      purchase_price      REAL,
      purchase_funding    TEXT,
      purchase_paid_by    TEXT,
      purchase_reimbursed INTEGER DEFAULT 0,
      target_sell_price   REAL,
      listed_sell_price   REAL,
      actual_sell_price   REAL,
      purchase_date       TEXT,
      sale_date           TEXT,
      source_platform     TEXT,
      source_link         TEXT,
      seller_name         TEXT,
      seller_contact      TEXT,
      buyer_name          TEXT,
      buyer_contact       TEXT,
      status              TEXT,
      notes               TEXT,
      previous_owners     INTEGER,
      service_history     TEXT,
      last_service_date   TEXT,
      last_service_km     INTEGER,
      expenses            TEXT DEFAULT '[]',
      status_history      TEXT DEFAULT '[]',
      photos              TEXT DEFAULT '[]',
      created_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS pot_transactions (
      id          TEXT PRIMARY KEY,
      type        TEXT,
      amount      REAL,
      partner_id  TEXT,
      date        TEXT,
      note        TEXT,
      created_at  TEXT
    );

    -- Allgemeine Kosten (NICHT an ein Auto gebunden): Server, Werkzeug, Miete ...
    -- Geldfluss identisch zu Auto-Ausgaben: pot -> direkt vom Topf,
    -- private -> offene Erstattung an Partner (bis reimbursed=1).
    CREATE TABLE IF NOT EXISTS general_expenses (
      id              TEXT PRIMARY KEY,
      category        TEXT,
      amount          REAL,
      funding_source  TEXT,            -- 'pot' | 'private'
      paid_by         TEXT,            -- partner id wenn private
      reimbursed      INTEGER DEFAULT 0,
      reimbursed_date TEXT,
      date            TEXT,            -- YYYY-MM-DD
      note            TEXT,
      recurring_id    TEXT,            -- Verweis auf wiederkehrende Regel (oder NULL)
      auto_generated  INTEGER DEFAULT 0,
      period          TEXT,            -- 'YYYY-MM' bei wiederkehrenden Buchungen
      created_at      TEXT
    );

    -- Regeln fuer automatisch monatlich gebuchte allgemeine Kosten.
    -- materializeRecurring() in server.js erzeugt daraus die Buchungen.
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id              TEXT PRIMARY KEY,
      category        TEXT,
      amount          REAL,
      funding_source  TEXT,            -- 'pot' | 'private'
      paid_by         TEXT,
      day_of_month    INTEGER,         -- 1..28 (Buchungstag im Monat)
      start_date      TEXT,            -- YYYY-MM-DD (ab wann)
      active          INTEGER DEFAULT 1,
      note            TEXT,
      last_period     TEXT,            -- 'YYYY-MM' zuletzt gebuchter Monat (Wasserzeichen)
      created_at      TEXT
    );
  `);

  // Nachtraegliche Spalten fuer bereits bestehende Datenbanken
  ensureColumns('cars', {
    previous_owners: 'INTEGER',
    service_history: 'TEXT',
    last_service_date: 'TEXT',
    last_service_km: 'INTEGER'
  });
}

// ─── (De-)Serialisierung ─────────────────────────────────────────────────────
const JSON_COLUMNS = ['expenses', 'status_history', 'photos'];
const BOOL_COLUMNS = ['purchase_reimbursed'];

// DB-Zeile (Strings/0-1) → JS-Objekt (Arrays/Booleans) wie von Supabase
function parseCar(row) {
  if (!row) return row;
  const out = { ...row };
  for (const col of JSON_COLUMNS) {
    try {
      out[col] = row[col] ? JSON.parse(row[col]) : [];
    } catch {
      out[col] = [];
    }
  }
  for (const col of BOOL_COLUMNS) {
    out[col] = !!row[col];
  }
  return out;
}

// JS-Wert → DB-Wert (Arrays→JSON-String, Boolean→0/1)
function toDbValue(col, value) {
  if (JSON_COLUMNS.includes(col)) {
    return JSON.stringify(value ?? []);
  }
  if (BOOL_COLUMNS.includes(col)) {
    return value ? 1 : 0;
  }
  return value;
}

// ─── CARS ────────────────────────────────────────────────────────────────────
function getCars() {
  return db.prepare('SELECT * FROM cars').all().map(parseCar);
}

function getCarsOrdered() {
  // created_at absteigend (neueste zuerst), wie .order('created_at', desc)
  return db.prepare('SELECT * FROM cars ORDER BY created_at DESC').all().map(parseCar);
}

function getCar(id) {
  return parseCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(id));
}

function insertCar(row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(c => '@' + c).join(', ');
  const params = {};
  for (const c of cols) params[c] = toDbValue(c, row[c]);
  db.prepare(`INSERT INTO cars (${cols.join(', ')}) VALUES (${placeholders})`).run(params);
  return getCar(row.id);
}

function updateCar(id, updates) {
  const cols = Object.keys(updates);
  if (cols.length === 0) return getCar(id);
  const setClause = cols.map(c => `${c} = @${c}`).join(', ');
  const params = { _id: id };
  for (const c of cols) params[c] = toDbValue(c, updates[c]);
  db.prepare(`UPDATE cars SET ${setClause} WHERE id = @_id`).run(params);
  return getCar(id);
}

function deleteCar(id) {
  db.prepare('DELETE FROM cars WHERE id = ?').run(id);
}

// ─── POT-TRANSAKTIONEN ───────────────────────────────────────────────────────
function getPotTransactions() {
  return db.prepare('SELECT * FROM pot_transactions').all();
}

function getPotTransactionsOrdered() {
  return db.prepare('SELECT * FROM pot_transactions ORDER BY date DESC').all();
}

function insertPotTransaction(t) {
  db.prepare(`
    INSERT INTO pot_transactions (id, type, amount, partner_id, date, note, created_at)
    VALUES (@id, @type, @amount, @partner_id, @date, @note, @created_at)
  `).run({
    id: t.id,
    type: t.type,
    amount: t.amount,
    partner_id: t.partner_id,
    date: t.date,
    note: t.note,
    created_at: t.created_at || new Date().toISOString()
  });
  return db.prepare('SELECT * FROM pot_transactions WHERE id = ?').get(t.id);
}

function deletePotTransaction(id) {
  db.prepare('DELETE FROM pot_transactions WHERE id = ?').run(id);
}

// ─── ALLGEMEINE KOSTEN ───────────────────────────────────────────────────────
const GEXP_BOOL = ['reimbursed', 'auto_generated'];

function parseGeneralExpense(row) {
  if (!row) return row;
  const out = { ...row };
  for (const c of GEXP_BOOL) out[c] = !!row[c];
  return out;
}

function getGeneralExpenses() {
  return db.prepare('SELECT * FROM general_expenses').all().map(parseGeneralExpense);
}

function getGeneralExpensesOrdered() {
  return db.prepare('SELECT * FROM general_expenses ORDER BY date DESC, created_at DESC').all().map(parseGeneralExpense);
}

function getGeneralExpense(id) {
  return parseGeneralExpense(db.prepare('SELECT * FROM general_expenses WHERE id = ?').get(id));
}

function insertGeneralExpense(row) {
  db.prepare(`
    INSERT INTO general_expenses
      (id, category, amount, funding_source, paid_by, reimbursed, reimbursed_date,
       date, note, recurring_id, auto_generated, period, created_at)
    VALUES
      (@id, @category, @amount, @funding_source, @paid_by, @reimbursed, @reimbursed_date,
       @date, @note, @recurring_id, @auto_generated, @period, @created_at)
  `).run({
    id: row.id,
    category: row.category || 'sonstiges',
    amount: row.amount || 0,
    funding_source: row.funding_source || 'pot',
    paid_by: row.paid_by || '',
    reimbursed: row.reimbursed ? 1 : 0,
    reimbursed_date: row.reimbursed_date || null,
    date: row.date || null,
    note: row.note || '',
    recurring_id: row.recurring_id || null,
    auto_generated: row.auto_generated ? 1 : 0,
    period: row.period || null,
    created_at: row.created_at || new Date().toISOString()
  });
  return getGeneralExpense(row.id);
}

function updateGeneralExpense(id, updates) {
  const cols = Object.keys(updates);
  if (cols.length === 0) return getGeneralExpense(id);
  const setClause = cols.map(c => `${c} = @${c}`).join(', ');
  const params = { _id: id };
  for (const c of cols) {
    params[c] = GEXP_BOOL.includes(c) ? (updates[c] ? 1 : 0) : updates[c];
  }
  db.prepare(`UPDATE general_expenses SET ${setClause} WHERE id = @_id`).run(params);
  return getGeneralExpense(id);
}

function deleteGeneralExpense(id) {
  db.prepare('DELETE FROM general_expenses WHERE id = ?').run(id);
}

function deleteGeneralExpensesByRecurring(recurringId) {
  db.prepare('DELETE FROM general_expenses WHERE recurring_id = ?').run(recurringId);
}

// ─── WIEDERKEHRENDE KOSTEN-REGELN ────────────────────────────────────────────
function parseRecurring(row) {
  if (!row) return row;
  return { ...row, active: !!row.active };
}

function getRecurringExpenses() {
  return db.prepare('SELECT * FROM recurring_expenses ORDER BY created_at DESC').all().map(parseRecurring);
}

function getRecurringExpensesActive() {
  return db.prepare('SELECT * FROM recurring_expenses WHERE active = 1').all().map(parseRecurring);
}

function getRecurringExpense(id) {
  return parseRecurring(db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id));
}

function insertRecurringExpense(row) {
  db.prepare(`
    INSERT INTO recurring_expenses
      (id, category, amount, funding_source, paid_by, day_of_month, start_date, active, note, last_period, created_at)
    VALUES
      (@id, @category, @amount, @funding_source, @paid_by, @day_of_month, @start_date, @active, @note, @last_period, @created_at)
  `).run({
    id: row.id,
    category: row.category || 'sonstiges',
    amount: row.amount || 0,
    funding_source: row.funding_source || 'pot',
    paid_by: row.paid_by || '',
    day_of_month: row.day_of_month || 1,
    start_date: row.start_date || null,
    active: row.active === undefined ? 1 : (row.active ? 1 : 0),
    note: row.note || '',
    last_period: row.last_period || null,
    created_at: row.created_at || new Date().toISOString()
  });
  return getRecurringExpense(row.id);
}

function updateRecurringExpense(id, updates) {
  const cols = Object.keys(updates);
  if (cols.length === 0) return getRecurringExpense(id);
  const setClause = cols.map(c => `${c} = @${c}`).join(', ');
  const params = { _id: id };
  for (const c of cols) {
    params[c] = (c === 'active') ? (updates[c] ? 1 : 0) : updates[c];
  }
  db.prepare(`UPDATE recurring_expenses SET ${setClause} WHERE id = @_id`).run(params);
  return getRecurringExpense(id);
}

function deleteRecurringExpense(id) {
  db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id);
}

module.exports = {
  db,
  DATA_DIR,
  DB_PATH,
  initSchema,
  getCars,
  getCarsOrdered,
  getCar,
  insertCar,
  updateCar,
  deleteCar,
  getPotTransactions,
  getPotTransactionsOrdered,
  insertPotTransaction,
  deletePotTransaction,
  getGeneralExpenses,
  getGeneralExpensesOrdered,
  getGeneralExpense,
  insertGeneralExpense,
  updateGeneralExpense,
  deleteGeneralExpense,
  deleteGeneralExpensesByRecurring,
  getRecurringExpenses,
  getRecurringExpensesActive,
  getRecurringExpense,
  insertRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense
};
