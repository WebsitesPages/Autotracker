// Repository fuer die cars-Tabelle. JSON-Spalten (expenses, status_history,
// photos) werden beim Lesen geparst und beim Schreiben serialisiert,
// purchase_reimbursed als echtes Boolean geliefert.
const { db } = require('./index');

const JSON_COLUMNS = ['expenses', 'status_history', 'photos'];
const BOOL_COLUMNS = ['purchase_reimbursed'];

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

function toDbValue(col, value) {
  if (JSON_COLUMNS.includes(col)) return JSON.stringify(value ?? []);
  if (BOOL_COLUMNS.includes(col)) return value ? 1 : 0;
  return value;
}

function all() {
  return db.prepare('SELECT * FROM cars').all().map(parseCar);
}

function allOrdered() {
  return db.prepare('SELECT * FROM cars ORDER BY created_at DESC').all().map(parseCar);
}

function get(id) {
  return parseCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(id));
}

function insert(row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(c => '@' + c).join(', ');
  const params = {};
  for (const c of cols) params[c] = toDbValue(c, row[c]);
  db.prepare(`INSERT INTO cars (${cols.join(', ')}) VALUES (${placeholders})`).run(params);
  return get(row.id);
}

function update(id, updates) {
  const cols = Object.keys(updates);
  if (cols.length === 0) return get(id);
  const setClause = cols.map(c => `${c} = @${c}`).join(', ');
  const params = { _id: id };
  for (const c of cols) params[c] = toDbValue(c, updates[c]);
  db.prepare(`UPDATE cars SET ${setClause} WHERE id = @_id`).run(params);
  return get(id);
}

function remove(id) {
  db.prepare('DELETE FROM cars WHERE id = ?').run(id);
}

module.exports = { all, allOrdered, get, insert, update, remove };
