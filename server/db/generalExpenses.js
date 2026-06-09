// Repository fuer general_expenses (Betriebskosten ohne Auto-Bezug)
const { db } = require('./index');

const BOOL = ['reimbursed', 'auto_generated'];

function parse(row) {
  if (!row) return row;
  const out = { ...row };
  for (const c of BOOL) out[c] = !!row[c];
  return out;
}

function all() {
  return db.prepare('SELECT * FROM general_expenses').all().map(parse);
}

function allOrdered() {
  return db.prepare('SELECT * FROM general_expenses ORDER BY date DESC, created_at DESC').all().map(parse);
}

function get(id) {
  return parse(db.prepare('SELECT * FROM general_expenses WHERE id = ?').get(id));
}

function insert(row) {
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
  return get(row.id);
}

function update(id, updates) {
  const cols = Object.keys(updates);
  if (cols.length === 0) return get(id);
  const setClause = cols.map(c => `${c} = @${c}`).join(', ');
  const params = { _id: id };
  for (const c of cols) {
    params[c] = BOOL.includes(c) ? (updates[c] ? 1 : 0) : updates[c];
  }
  db.prepare(`UPDATE general_expenses SET ${setClause} WHERE id = @_id`).run(params);
  return get(id);
}

function remove(id) {
  db.prepare('DELETE FROM general_expenses WHERE id = ?').run(id);
}

function removeByRecurring(recurringId) {
  db.prepare('DELETE FROM general_expenses WHERE recurring_id = ?').run(recurringId);
}

module.exports = { all, allOrdered, get, insert, update, remove, removeByRecurring };
