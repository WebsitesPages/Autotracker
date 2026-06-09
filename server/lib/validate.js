// Kleine, dependency-freie Validierungshelfer. Wirft ValidationError (-> 400).
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function fail(field, why) {
  throw new ValidationError(`Ungültige Eingabe: ${field} ${why}`);
}

// Pflichtbetrag: endliche Zahl > 0
function amount(value, field = 'Betrag') {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !isFinite(n)) fail(field, 'muss eine Zahl sein');
  if (n <= 0) fail(field, 'muss größer als 0 sein');
  if (n > 100_000_000) fail(field, 'ist unrealistisch groß');
  return Math.round(n * 100) / 100;
}

// Optionale Zahl (Preise, km, PS ...); leer -> null
function optionalNumber(value, field = 'Wert', { min = 0, max = 100_000_000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !isFinite(n)) fail(field, 'muss eine Zahl sein');
  if (n < min || n > max) fail(field, `muss zwischen ${min} und ${max} liegen`);
  return n;
}

// Datum YYYY-MM-DD; leer -> fallback (default: null)
function optionalDate(value, field = 'Datum', fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(value).getTime())) {
    fail(field, 'muss im Format JJJJ-MM-TT sein');
  }
  return value;
}

function str(value, field = 'Text', { max = 2000, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(field, 'darf nicht leer sein');
    return '';
  }
  if (typeof value !== 'string') fail(field, 'muss Text sein');
  if (value.length > max) fail(field, `darf höchstens ${max} Zeichen haben`);
  return value.trim();
}

function oneOf(value, allowed, field, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    fail(field, 'fehlt');
  }
  if (!allowed.includes(value)) fail(field, `muss eines von [${allowed.join(', ')}] sein`);
  return value;
}

const today = () => new Date().toISOString().slice(0, 10);

module.exports = { ValidationError, amount, optionalNumber, optionalDate, str, oneOf, today };
