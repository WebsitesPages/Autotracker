// Zentrale Fehlerbehandlung: Validierungsfehler -> 400, Rest -> 500.
// Immer JSON, nie eine HTML-Fehlerseite.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Datei zu groß (max. ~50 MB).' });
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error('Serverfehler:', err);
  }
  res.status(status).json({ error: err.message || 'Interner Fehler' });
}

module.exports = { errorHandler };
