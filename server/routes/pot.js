// Pot (gemeinsame Kasse): Einzahlungen, Entnahmen, Transaktionsliste
const express = require('express');
const potRepo = require('../db/pot');
const audit = require('../services/audit');
const config = require('../config');
const v = require('../lib/validate');

const router = express.Router();
const PARTNER_OPTIONS = [...config.PARTNERS.map(p => p.id), 'both'];

function createTransaction(req, type) {
  const body = req.body || {};
  return potRepo.insert({
    id: 'pot_' + Date.now(),
    type,
    amount: v.amount(body.amount),
    partner_id: v.oneOf(body.partnerId, PARTNER_OPTIONS, 'Partner', 'both'),
    date: v.optionalDate(body.date, 'Datum', v.today()),
    note: v.str(body.note, 'Notiz', { max: 500 }),
    created_at: new Date().toISOString()
  });
}

router.post('/api/pot/deposit', (req, res) => {
  const t = createTransaction(req, 'deposit');
  audit.log(req, 'pot.deposit', t.id, `Einzahlung ${t.amount} € (${t.partner_id})`);
  res.json({ ...t, partnerId: t.partner_id });
});

router.post('/api/pot/withdraw', (req, res) => {
  const t = createTransaction(req, 'withdrawal');
  audit.log(req, 'pot.withdraw', t.id, `Entnahme ${t.amount} € (${t.partner_id})`);
  res.json({ ...t, partnerId: t.partner_id });
});

router.get('/api/pot/transactions', (req, res) => {
  res.json(potRepo.allOrdered().map(t => ({ ...t, partnerId: t.partner_id })));
});

router.delete('/api/pot/transactions/:id', (req, res) => {
  potRepo.remove(req.params.id);
  audit.log(req, 'pot.transaction.delete', req.params.id, 'Pot-Transaktion gelöscht');
  res.json({ success: true });
});

module.exports = router;
