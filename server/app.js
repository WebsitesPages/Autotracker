// Express-App: Middleware-Kette + Routen. Reihenfolge ist bewusst:
// Security-Header -> Body-Parser -> Login/Session (offen) -> Auth-Gate -> Rest.
const express = require('express');
const path = require('path');
const config = require('./config');
const auth = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.set('trust proxy', true); // hinter nginx: echte Client-IP fuer Rate-Limit
  app.disable('x-powered-by');

  // Basis-Security-Header (App laeuft nur same-origin hinter nginx)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // 50mb: PDFs werden ungekuerzt als Base64 geschickt (passend zu nginx client_max_body_size)
  app.use(express.json({ limit: config.JSON_LIMIT }));

  // Offene Endpunkte: Login/Logout/Session
  app.use(require('./routes/auth'));

  // App-Shell (gebaute SPA) ist oeffentlich – sie zeigt selbst den Login-Screen.
  // Alle DATEN (API) und Uploads bleiben hinter dem Auth-Gate darunter.
  app.use(express.static(config.PUBLIC_DIR));

  // Auth-Gate: ab hier ist alles geschuetzt
  app.use((req, res, next) => {
    const session = auth.getAuth(req);
    if (session) {
      req.auth = session;
      return next();
    }
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    // Unbekannte Seitenpfade ohne Login -> SPA ausliefern (zeigt Login)
    return res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
  });

  // Hochgeladene Dateien (nur mit Login erreichbar)
  app.use('/uploads', express.static(config.UPLOADS_DIR));

  // API-Routen
  app.use(require('./routes/stats'));
  app.use(require('./routes/cars'));
  app.use(require('./routes/pot'));
  app.use(require('./routes/generalExpenses'));
  app.use(require('./routes/exports'));

  // Catch-all fuer die SPA
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
