// Login & Session: ein gemeinsames Passwort, Identitaet (mert/tobias) wird beim
// Login gewaehlt. Session = signiertes, langlebiges HttpOnly-Cookie (stateless,
// uebersteht Container-Neustarts -> iPhone-Homescreen-App bleibt angemeldet).
//
// Cookie-Format v2:  v2.<user>.<expiresMs>.<hmac(user|expiresMs)>
// Legacy-Format:     sha256(APP_PASSWORD|AUTH_SECRET)  -> bleibt gueltig,
//                    damit bestehende Logins nicht rausfliegen (user = null).
const crypto = require('crypto');
const config = require('../config');

const LEGACY_TOKEN = crypto.createHash('sha256')
  .update(config.APP_PASSWORD + '|' + config.AUTH_SECRET).digest('hex');

function sign(payload) {
  return crypto.createHmac('sha256', config.AUTH_SECRET).update(payload).digest('hex');
}

function createToken(user) {
  const expires = Date.now() + config.COOKIE_MAX_AGE;
  const payload = `${user}|${expires}`;
  return `v2.${user}.${expires}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token) return null;
  if (token === LEGACY_TOKEN) return { user: null };
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v2') return null;
  const [, user, expires, sig] = parts;
  const expected = sign(`${user}|${expires}`);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(expires) < Date.now()) return null;
  return { user };
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function getAuth(req) {
  return verifyToken(parseCookies(req.headers.cookie)[config.COOKIE_NAME]);
}

function setAuthCookie(res, user) {
  res.cookie(config.COOKIE_NAME, createToken(user), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: config.COOKIE_MAX_AGE,
    path: config.COOKIE_PATH
  });
}

function clearAuthCookie(res) {
  res.clearCookie(config.COOKIE_NAME, { path: config.COOKIE_PATH });
}

// Brute-Force-Bremse fuer den Login: max. 10 Fehlversuche pro IP in 15 Minuten
const attempts = new Map(); // ip -> { count, resetAt }
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function loginRateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && now < entry.resetAt && entry.count >= MAX_ATTEMPTS) {
    const waitMin = Math.ceil((entry.resetAt - now) / 60000);
    return res.status(429).json({ error: `Zu viele Fehlversuche. Bitte in ${waitMin} Min. erneut versuchen.` });
  }
  next();
}

function registerFailedLogin(req) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

function resetLoginAttempts(req) {
  attempts.delete(req.ip || 'unknown');
}

module.exports = {
  getAuth,
  setAuthCookie,
  clearAuthCookie,
  loginRateLimit,
  registerFailedLogin,
  resetLoginAttempts
};
