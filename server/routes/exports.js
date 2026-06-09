// CSV-Exporte (deutsches Excel-Format: Semikolon, UTF-8 BOM, Dezimal-Komma)
const express = require('express');
const carsRepo = require('../db/cars');
const potRepo = require('../db/pot');
const gexpRepo = require('../db/generalExpenses');
const finance = require('../services/finance');
const { toCsv, deNum, sendCsv } = require('../lib/csv');

const router = express.Router();

const STATUS_DE = {
  visited: 'Besichtigt', purchased: 'Gekauft', in_progress: 'In Aufbereitung',
  listed: 'Inseriert', sold: 'Verkauft'
};

router.get('/api/export/cars.csv', (req, res) => {
  const rows = carsRepo.allOrdered().map(car => {
    const expensesSum = (car.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    const totalCost = finance.carTotalCost(car);
    const profit = car.status === 'sold' ? (car.actual_sell_price || 0) - totalCost : null;
    return [
      car.brand, car.model, car.year, car.mileage, car.vin,
      STATUS_DE[car.status] || car.status,
      car.purchase_date, deNum(car.purchase_price),
      deNum(expensesSum), deNum(totalCost),
      car.sale_date, deNum(car.actual_sell_price),
      profit === null ? '' : deNum(finance.round2(profit)),
      car.source_platform, car.seller_name, car.buyer_name
    ];
  });
  sendCsv(res, 'fahrzeuge.csv', toCsv(
    ['Marke', 'Modell', 'Baujahr', 'KM', 'FIN', 'Status', 'Kaufdatum', 'Kaufpreis',
     'Ausgaben', 'Gesamtkosten', 'Verkaufsdatum', 'Verkaufspreis', 'Gewinn',
     'Plattform', 'Verkäufer', 'Käufer'],
    rows
  ));
});

router.get('/api/export/kosten.csv', (req, res) => {
  const rows = [];
  for (const car of carsRepo.allOrdered()) {
    const name = [car.brand, car.model].filter(Boolean).join(' ');
    for (const e of car.expenses || []) {
      rows.push([e.date, 'Fahrzeug: ' + name, e.category, deNum(e.amount),
        e.fundingSource === 'pot' ? 'Pot' : 'Privat', e.paidBy || '',
        e.reimbursed ? 'ja' : '', e.note || '']);
    }
  }
  for (const g of gexpRepo.allOrdered()) {
    rows.push([g.date, 'Allgemein', g.category, deNum(g.amount),
      g.funding_source === 'pot' ? 'Pot' : 'Privat', g.paid_by || '',
      g.reimbursed ? 'ja' : '', g.note || '']);
  }
  rows.sort((a, b) => String(b[0] || '').localeCompare(String(a[0] || '')));
  sendCsv(res, 'kosten.csv', toCsv(
    ['Datum', 'Bereich', 'Kategorie', 'Betrag', 'Bezahlt aus', 'Bezahlt von', 'Erstattet', 'Notiz'],
    rows
  ));
});

router.get('/api/export/pot.csv', (req, res) => {
  const rows = potRepo.allOrdered().map(t => [
    t.date,
    t.type === 'deposit' ? 'Einzahlung' : 'Entnahme',
    deNum(t.amount),
    t.partner_id === 'both' ? 'Beide' : t.partner_id,
    t.note || ''
  ]);
  sendCsv(res, 'pot.csv', toCsv(['Datum', 'Typ', 'Betrag', 'Partner', 'Notiz'], rows));
});

module.exports = router;
