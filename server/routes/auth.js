const express = require('express');
const config = require('../config');
const auth = require('../middleware/auth');
const audit = require('../services/audit');
const { oneOf } = require('../lib/validate');

const router = express.Router();

// Login: Passwort pruefen + Identitaet (mert/tobias) ins Cookie schreiben.
router.post('/api/login', auth.loginRateLimit, async (req, res) => {
  const pw = (req.body && req.body.password) || '';
  const user = oneOf(req.body && req.body.user, config.PARTNERS.map(p => p.id), 'Benutzer', 'mert');

  if (pw === config.APP_PASSWORD) {
    auth.resetLoginAttempts(req);
    auth.setAuthCookie(res, user);
    audit.log({ auth: { user } }, 'auth.login', null, 'Anmeldung');
    return res.json({ success: true, user });
  }

  auth.registerFailedLogin(req);
  await new Promise(r => setTimeout(r, 600)); // kleiner Bremsklotz gegen Brute-Force
  res.status(401).json({ error: 'Falsches Passwort' });
});

router.post('/api/logout', (req, res) => {
  auth.clearAuthCookie(res);
  res.json({ success: true });
});

// Session-Status fuer die SPA (vor dem Auth-Gate erreichbar)
router.get('/api/session', (req, res) => {
  const session = auth.getAuth(req);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: session.user });
});

module.exports = router;
