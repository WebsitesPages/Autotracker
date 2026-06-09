// Finanz-Logik: Pot-Stand, offene Erstattungen, Kennzahlen und Zeitreihen.
// Alles wird aus den Rohdaten berechnet (kein gespeicherter Saldo), dadurch
// ist der Pot-Stand immer konsistent zu Autos, Ausgaben und Transaktionen.
const carsRepo = require('../db/cars');
const potRepo = require('../db/pot');
const gexpRepo = require('../db/generalExpenses');
const recurringRepo = require('../db/recurring');
const config = require('../config');

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

// Wiederkehrende Kosten materialisieren: erzeugt fuer jede aktive Regel die
// fehlenden Monatsbuchungen vom zuletzt gebuchten Monat (last_period) bis zum
// aktuellen Monat. Idempotent & selbstheilend; das Wasserzeichen last_period
// verhindert, dass eine vom User geloeschte Monatsbuchung wieder auftaucht.
function materializeRecurring() {
  const rules = recurringRepo.allActive();
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth(); // 0-basiert

  for (const rule of rules) {
    const start = new Date((rule.start_date || '') + 'T00:00:00');
    if (isNaN(start.getTime())) continue;

    let y, m;
    if (rule.last_period) {
      const [ly, lm] = rule.last_period.split('-').map(Number);
      y = ly; m = lm; // lm ist 1-basiert -> entspricht 0-basiert dem Folgemonat
      if (m > 11) { m = 0; y++; }
    } else {
      y = start.getFullYear(); m = start.getMonth();
    }

    let lastPeriod = rule.last_period;
    const day = Math.min(Math.max(rule.day_of_month || 1, 1), 28);

    while (y < curY || (y === curY && m <= curM)) {
      const period = `${y}-${String(m + 1).padStart(2, '0')}`;
      const dateStr = `${period}-${String(day).padStart(2, '0')}`;
      gexpRepo.insert({
        id: 'gexp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        category: rule.category,
        amount: rule.amount,
        funding_source: rule.funding_source,
        paid_by: rule.paid_by,
        reimbursed: 0,
        reimbursed_date: null,
        date: dateStr,
        note: rule.note,
        recurring_id: rule.id,
        auto_generated: 1,
        period,
        created_at: new Date().toISOString()
      });
      lastPeriod = period;
      m++; if (m > 11) { m = 0; y++; }
    }

    if (lastPeriod && lastPeriod !== rule.last_period) {
      recurringRepo.update(rule.id, { last_period: lastPeriod });
    }
  }
}

function getPartners() {
  return config.PARTNERS.map(p => ({ ...p, openReimbursement: 0 }));
}

function recalculate() {
  // Faellige wiederkehrende Kosten zuerst buchen, damit sie hier mitzaehlen
  materializeRecurring();

  const cars = carsRepo.all();
  const potTransactions = potRepo.all();
  const generalExpenses = gexpRepo.all();
  const partners = getPartners();

  let potBalance = 0;
  for (const t of potTransactions) {
    if (t.type === 'deposit') potBalance += t.amount;
    else if (t.type === 'withdrawal') potBalance -= t.amount;
  }

  let totalRevenue = 0, totalInvested = 0;

  for (const car of cars) {
    // Besichtigte Autos beeinflussen den Pot NICHT (nur ihre Ausgaben zählen)
    const istBesichtigt = car.status === 'visited';

    if (car.purchase_price && !istBesichtigt) {
      // 'none' oder leer wird wie 'pot' behandelt (Standardfall)
      const funding = (car.purchase_funding === 'private') ? 'private' : 'pot';
      if (funding === 'pot') {
        potBalance -= car.purchase_price;
        totalInvested += car.purchase_price;
      } else {
        totalInvested += car.purchase_price;
        const partner = partners.find(p => p.id === car.purchase_paid_by);
        if (partner) {
          if (!car.purchase_reimbursed) {
            partner.openReimbursement += car.purchase_price;
          } else {
            potBalance -= car.purchase_price;
          }
        }
      }
    }

    for (const exp of car.expenses || []) {
      if (exp.fundingSource === 'pot') {
        potBalance -= exp.amount;
      } else if (exp.fundingSource === 'private') {
        const partner = partners.find(p => p.id === exp.paidBy);
        if (partner) {
          if (!exp.reimbursed) {
            partner.openReimbursement += exp.amount;
          } else {
            potBalance -= exp.amount;
          }
        }
      }
    }

    if (car.status === 'sold' && car.actual_sell_price) {
      potBalance += car.actual_sell_price;
      totalRevenue += car.actual_sell_price;
    }
  }

  // Allgemeine Kosten: gleicher Geldfluss wie Auto-Ausgaben
  let totalOverhead = 0;
  for (const g of generalExpenses) {
    totalOverhead += g.amount || 0;
    if (g.funding_source === 'pot') {
      potBalance -= g.amount;
    } else if (g.funding_source === 'private') {
      const partner = partners.find(p => p.id === g.paid_by);
      if (partner) {
        if (!g.reimbursed) {
          partner.openReimbursement += g.amount;
        } else {
          potBalance -= g.amount;
        }
      }
    }
  }

  for (const p of partners) p.openReimbursement = round2(p.openReimbursement);

  return {
    potBalance: round2(potBalance),
    totalInvested: round2(totalInvested),
    totalRevenue: round2(totalRevenue),
    totalOverhead: round2(totalOverhead),
    partners,
    cars
  };
}

function carTotalCost(car) {
  return (car.purchase_price || 0) + (car.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
}

// Kennzahlen + Zeitreihen fuer Dashboard und Auswertung
function stats() {
  const calc = recalculate();
  const cars = calc.cars;

  const activeCars = cars.filter(c => c.status !== 'sold' && c.status !== 'visited');
  const soldCars = cars.filter(c => c.status === 'sold');

  let totalProfit = 0;
  for (const car of soldCars) {
    totalProfit += (car.actual_sell_price || 0) - carTotalCost(car);
  }
  const avgProfit = soldCars.length > 0 ? totalProfit / soldCars.length : 0;

  let avgDays = 0;
  if (soldCars.length > 0) {
    const totalDays = soldCars.reduce((sum, car) => {
      if (car.purchase_date && car.sale_date) {
        return sum + Math.ceil((new Date(car.sale_date) - new Date(car.purchase_date)) / 86400000);
      }
      return sum;
    }, 0);
    avgDays = Math.round(totalDays / soldCars.length);
  }

  // Kapitalbindung: was steckt aktuell in unverkauften Autos
  const boundCapital = activeCars.reduce((s, c) => s + carTotalCost(c), 0);

  return {
    potBalance: calc.potBalance,
    activeCars: activeCars.length,
    soldCars: soldCars.length,
    totalProfit: round2(totalProfit),
    avgProfit: round2(avgProfit),
    avgDays,
    partners: calc.partners,
    totalInvested: calc.totalInvested,
    totalRevenue: calc.totalRevenue,
    totalOverhead: calc.totalOverhead,
    boundCapital: round2(boundCapital),
    // Netto-Gewinn = reiner Auto-Handelsgewinn minus Betriebskosten
    netProfit: round2(totalProfit - calc.totalOverhead),
    monthly: monthlySeries(cars, 12),
    costByCategory: costByCategory(cars),
    carResults: carResults(soldCars)
  };
}

// Letzte n Monate: Handelsgewinn (nach Verkaufsmonat), Betriebskosten, Netto
function monthlySeries(cars, n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      period: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      profit: 0,
      overhead: 0,
      sold: 0
    });
  }
  const byPeriod = new Map(months.map(m => [m.period, m]));

  for (const car of cars) {
    if (car.status !== 'sold' || !car.sale_date) continue;
    const m = byPeriod.get(String(car.sale_date).slice(0, 7));
    if (m) {
      m.profit += (car.actual_sell_price || 0) - carTotalCost(car);
      m.sold++;
    }
  }
  for (const g of gexpRepo.all()) {
    if (!g.date) continue;
    const m = byPeriod.get(String(g.date).slice(0, 7));
    if (m) m.overhead += g.amount || 0;
  }
  for (const m of months) {
    m.profit = round2(m.profit);
    m.overhead = round2(m.overhead);
    m.net = round2(m.profit - m.overhead);
  }
  return months;
}

// Auto-Ausgaben + allgemeine Kosten je Kategorie (fuer Donut/Balken)
function costByCategory(cars) {
  const sum = new Map();
  const add = (scope, cat, amount) => {
    const key = scope + ':' + (cat || 'sonstiges');
    sum.set(key, (sum.get(key) || 0) + (amount || 0));
  };
  for (const car of cars) {
    for (const e of car.expenses || []) add('car', e.category, e.amount);
  }
  for (const g of gexpRepo.all()) add('general', g.category, g.amount);

  return [...sum.entries()]
    .map(([key, total]) => {
      const [scope, category] = key.split(':');
      return { scope, category, total: round2(total) };
    })
    .sort((a, b) => b.total - a.total);
}

// Ergebnis pro verkauftem Auto (fuer Margen-Tabelle in der Auswertung)
function carResults(soldCars) {
  return soldCars
    .map(car => {
      const cost = carTotalCost(car);
      const profit = (car.actual_sell_price || 0) - cost;
      let days = null;
      if (car.purchase_date && car.sale_date) {
        days = Math.ceil((new Date(car.sale_date) - new Date(car.purchase_date)) / 86400000);
      }
      return {
        id: car.id,
        name: [car.brand, car.model].filter(Boolean).join(' '),
        saleDate: car.sale_date,
        cost: round2(cost),
        revenue: round2(car.actual_sell_price || 0),
        profit: round2(profit),
        marginPct: cost > 0 ? round2((profit / cost) * 100) : null,
        days
      };
    })
    .sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
}

module.exports = { round2, materializeRecurring, recalculate, stats, carTotalCost };
