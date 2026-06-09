// Kennzahlen, Gesamtdaten und Audit-Trail
const express = require('express');
const carsRepo = require('../db/cars');
const potRepo = require('../db/pot');
const gexpRepo = require('../db/generalExpenses');
const recurringRepo = require('../db/recurring');
const mapper = require('../lib/carMapper');
const finance = require('../services/finance');
const audit = require('../services/audit');

const router = express.Router();

// Frueher Supabase-Konfiguration – bleibt aus Kompatibilitaetsgruenden erhalten
router.get('/api/config', (req, res) => {
  res.json({});
});

router.get('/api/stats', (req, res) => {
  res.json(finance.stats());
});

router.get('/api/data', (req, res) => {
  const calc = finance.recalculate();
  res.json({
    cars: carsRepo.allOrdered().map(mapper.toApi),
    pot: {
      balance: calc.potBalance,
      totalInvested: calc.totalInvested,
      totalRevenue: calc.totalRevenue,
      totalOverhead: calc.totalOverhead
    },
    partners: calc.partners,
    potTransactions: potRepo.allOrdered().map(t => ({ ...t, partnerId: t.partner_id })),
    generalExpenses: gexpRepo.allOrdered(),
    recurringExpenses: recurringRepo.all()
  });
});

router.get('/api/audit', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  res.json(audit.recent(limit));
});

module.exports = router;
