// Allgemeine Kosten (autofrei) + monatliche Daueraufträge
const express = require('express');
const gexpRepo = require('../db/generalExpenses');
const recurringRepo = require('../db/recurring');
const finance = require('../services/finance');
const audit = require('../services/audit');
const config = require('../config');
const v = require('../lib/validate');

const router = express.Router();

const CATEGORIES = ['server', 'software', 'werkzeug', 'miete', 'versicherung',
  'buero', 'marketing', 'gebuehren', 'sonstiges'];
const PARTNER_IDS = config.PARTNERS.map(p => p.id);

router.get('/api/general-expenses', (req, res) => {
  const calc = finance.recalculate(); // bucht faellige wiederkehrende Kosten nach
  res.json({
    expenses: gexpRepo.allOrdered(),
    recurring: recurringRepo.all(),
    totalOverhead: calc.totalOverhead
  });
});

router.post('/api/general-expenses', (req, res) => {
  const body = req.body || {};
  const fundingSource = v.oneOf(body.fundingSource, ['pot', 'private'], 'Bezahlt aus', 'pot');
  const expense = gexpRepo.insert({
    id: 'gexp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    category: v.oneOf(body.category, CATEGORIES, 'Kategorie', 'sonstiges'),
    amount: v.amount(body.amount),
    funding_source: fundingSource,
    paid_by: fundingSource === 'private' ? v.oneOf(body.paidBy, PARTNER_IDS, 'Bezahlt von') : '',
    reimbursed: 0,
    reimbursed_date: null,
    date: v.optionalDate(body.date, 'Datum', v.today()),
    note: v.str(body.note, 'Notiz', { max: 500 }),
    recurring_id: null,
    auto_generated: 0,
    period: null,
    created_at: new Date().toISOString()
  });
  audit.log(req, 'overhead.create', expense.id, `Kosten ${expense.category} ${expense.amount} €`);
  res.json(expense);
});

router.delete('/api/general-expenses/:id', (req, res) => {
  const exp = gexpRepo.get(req.params.id);
  gexpRepo.remove(req.params.id);
  audit.log(req, 'overhead.delete', req.params.id,
    exp ? `Kosten ${exp.category} ${exp.amount} € gelöscht` : 'Kostenbuchung gelöscht');
  res.json({ success: true });
});

router.post('/api/general-expenses/:id/reimburse', (req, res) => {
  const exp = gexpRepo.get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Nicht gefunden' });
  const data = gexpRepo.update(req.params.id, {
    reimbursed: 1,
    reimbursed_date: v.today()
  });
  audit.log(req, 'overhead.reimburse', exp.id, `Kosten ${exp.amount} € erstattet`);
  res.json(data);
});

// ── Daueraufträge ───────────────────────────────────────────────────────────

router.post('/api/recurring-expenses', (req, res) => {
  const body = req.body || {};
  const fundingSource = v.oneOf(body.fundingSource, ['pot', 'private'], 'Bezahlt aus', 'pot');
  const rule = {
    id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    category: v.oneOf(body.category, CATEGORIES, 'Kategorie', 'sonstiges'),
    amount: v.amount(body.amount),
    funding_source: fundingSource,
    paid_by: fundingSource === 'private' ? v.oneOf(body.paidBy, PARTNER_IDS, 'Bezahlt von') : '',
    day_of_month: Math.min(Math.max(parseInt(body.dayOfMonth, 10) || 1, 1), 28),
    start_date: v.optionalDate(body.startDate, 'Startdatum', v.today()),
    active: 1,
    note: v.str(body.note, 'Notiz', { max: 500 }),
    last_period: null,
    created_at: new Date().toISOString()
  };
  recurringRepo.insert(rule);
  finance.materializeRecurring(); // vergangene + aktuellen Monat sofort buchen
  audit.log(req, 'recurring.create', rule.id, `Dauerauftrag ${rule.category} ${rule.amount} €/Monat`);
  res.json(recurringRepo.get(rule.id));
});

router.post('/api/recurring-expenses/:id/stop', (req, res) => {
  const rule = recurringRepo.get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Nicht gefunden' });
  const data = recurringRepo.update(req.params.id, { active: 0 });
  audit.log(req, 'recurring.stop', rule.id, `Dauerauftrag ${rule.category} gestoppt`);
  res.json(data);
});

// ?withBookings=1 entfernt auch alle automatisch erzeugten Buchungen der Regel
router.delete('/api/recurring-expenses/:id', (req, res) => {
  const rule = recurringRepo.get(req.params.id);
  const withBookings = req.query.withBookings === '1';
  if (withBookings) {
    gexpRepo.removeByRecurring(req.params.id);
  }
  recurringRepo.remove(req.params.id);
  audit.log(req, 'recurring.delete', req.params.id,
    `Dauerauftrag ${rule ? rule.category : ''} gelöscht${withBookings ? ' (inkl. Buchungen)' : ''}`);
  res.json({ success: true });
});

module.exports = router;
