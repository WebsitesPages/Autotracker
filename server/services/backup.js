// Automatische SQLite-Backups: beim Start und dann alle 24h eine konsistente
// Kopie (better-sqlite3 Online-Backup-API) nach data/backups, die letzten
// BACKUP_KEEP Staende werden behalten.
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const config = require('../config');

async function createBackup() {
  fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dest = path.join(config.BACKUP_DIR, `autotracker-${stamp}.db`);
  await db.backup(dest);
  prune();
  return dest;
}

function prune() {
  const files = fs.readdirSync(config.BACKUP_DIR)
    .filter(f => f.startsWith('autotracker-') && f.endsWith('.db'))
    .sort(); // Dateiname enthaelt ISO-Datum -> alphabetisch = chronologisch
  while (files.length > config.BACKUP_KEEP) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(config.BACKUP_DIR, oldest));
  }
}

function start() {
  const run = () =>
    createBackup()
      .then(dest => console.log('💾 Backup erstellt:', path.basename(dest)))
      .catch(e => console.error('Backup-Fehler:', e.message));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

module.exports = { start, createBackup };
