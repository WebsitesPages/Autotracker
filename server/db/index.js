// SQLite-Verbindung + Schema. Eine Datei = eine Verantwortung:
// Verbindung/Schema hier, Tabellen-Zugriffe in den Repository-Modulen daneben.
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(config.DATA_DIR, { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL'); // robuster bei parallelen Zugriffen

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

    -- Regeln fuer automatisch monatlich gebuchte allgemeine Kosten
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id              TEXT PRIMARY KEY,
      category        TEXT,
      amount          REAL,
      funding_source  TEXT,
      paid_by         TEXT,
      day_of_month    INTEGER,         -- 1..28
      start_date      TEXT,
      active          INTEGER DEFAULT 1,
      note            TEXT,
      last_period     TEXT,            -- 'YYYY-MM' zuletzt gebuchter Monat (Wasserzeichen)
      created_at      TEXT
    );

    -- Wer hat wann was geaendert (Audit-Trail)
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        TEXT NOT NULL,
      user      TEXT,
      action    TEXT NOT NULL,          -- z.B. 'car.create', 'pot.deposit'
      entity_id TEXT,
      summary   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);
  `);

  // Nachtraegliche Spalten fuer bereits bestehende Datenbanken (idempotent)
  ensureColumns('cars', {
    previous_owners: 'INTEGER',
    service_history: 'TEXT',
    last_service_date: 'TEXT',
    last_service_km: 'INTEGER'
  });
}

function ensureColumns(table, cols) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const [name, type] of Object.entries(cols)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }
}

module.exports = { db, initSchema };
