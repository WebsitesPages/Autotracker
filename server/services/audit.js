// Audit-Trail: jede Schreiboperation hinterlaesst eine Zeile "wer hat wann was".
// Der Nutzer kommt aus dem Login-Cookie (mert/tobias) – Alt-Logins ohne
// Identitaet werden als null geloggt.
const { db } = require('../db');

function log(req, action, entityId, summary) {
  try {
    db.prepare(`
      INSERT INTO audit_log (ts, user, action, entity_id, summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), (req.auth && req.auth.user) || null, action, entityId || null, summary || '');
  } catch (e) {
    // Audit darf nie eine fachliche Operation zum Scheitern bringen
    console.error('Audit-Fehler:', e.message);
  }
}

function recent(limit = 50) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = { log, recent };
