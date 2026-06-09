// Repository fuer pot_transactions (Einzahlungen/Entnahmen der gemeinsamen Kasse)
const { db } = require('./index');

function all() {
  return db.prepare('SELECT * FROM pot_transactions').all();
}

function allOrdered() {
  return db.prepare('SELECT * FROM pot_transactions ORDER BY date DESC, created_at DESC').all();
}

function insert(t) {
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

function remove(id) {
  db.prepare('DELETE FROM pot_transactions WHERE id = ?').run(id);
}

module.exports = { all, allOrdered, insert, remove };
