// Einstiegspunkt: Schema sicherstellen, Backups starten, Server hochfahren
const fs = require('fs');
const config = require('./config');
const { initSchema } = require('./db');
const backup = require('./services/backup');
const { createApp } = require('./app');

initSchema();
fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
backup.start();

createApp().listen(config.PORT, () => {
  console.log('AutoTracker läuft auf http://localhost:' + config.PORT);
});
