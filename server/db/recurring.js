// Repository fuer recurring_expenses (monatliche Daueraufträge)
const { db } = require('./index');

function parse(row) {
  if (!row) return row;
  return { ...row, active: !!row.active };
}

function all() {
  return db.prepare('SELECT * FROM recurring_expenses ORDER BY created_at DESC').all().map(parse);
}

function allActive() {
  return db.prepare('SELECT * FROM recurring_expenses WHERE active = 1').all().map(parse);
}

function get(id) {
  return parse(db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id));
}

function insert(row) {
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
  return get(row.id);
}

function update(id, updates) {
  const cols = Object.keys(updates);
  if (cols.length === 0) return get(id);
  const setClause = cols.map(c => `${c} = @${c}`).join(', ');
  const params = { _id: id };
  for (const c of cols) {
    params[c] = (c === 'active') ? (updates[c] ? 1 : 0) : updates[c];
  }
  db.prepare(`UPDATE recurring_expenses SET ${setClause} WHERE id = @_id`).run(params);
  return get(id);
}

function remove(id) {
  db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id);
}

module.exports = { all, allActive, get, insert, update, remove };
