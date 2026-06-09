// Zentrale Konfiguration – alle Umgebungsvariablen an einer Stelle.
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, 'autotracker.db'),
  UPLOADS_DIR: path.join(DATA_DIR, 'uploads'),
  BACKUP_DIR: path.join(DATA_DIR, 'backups'),
  BACKUP_KEEP: parseInt(process.env.BACKUP_KEEP, 10) || 14,
  PUBLIC_DIR: process.env.PUBLIC_DIR || path.join(ROOT_DIR, 'public'),

  // Login: ein gemeinsames Passwort, Identität (mert/tobias) wird beim Login gewählt.
  APP_PASSWORD: process.env.APP_PASSWORD || 'changeme',
  AUTH_SECRET: process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-me',
  COOKIE_NAME: 'at_auth',
  // In Produktion '/tracker' (nginx-Unterpfad), lokal '/'
  COOKIE_PATH: process.env.COOKIE_PATH || '/',
  COOKIE_MAX_AGE: 365 * 24 * 60 * 60 * 1000, // 1 Jahr

  // JSON-Limit muss zur client_max_body_size in nginx passen (PDF-Uploads als Base64)
  JSON_LIMIT: '50mb',

  PARTNERS: [
    { id: 'mert', name: 'Mert' },
    { id: 'tobias', name: 'Tobias' }
  ]
};
