const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Datenbank-Schema sicherstellen
db.initSchema();

// Upload-Verzeichnis (lokal statt Supabase Storage)
const UPLOADS_DIR = path.join(db.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── EINFACHER PASSWORT-LOGIN ────────────────────────────────────────────────
// Ein gemeinsames Passwort. Bei Erfolg setzt der Server ein langlebiges,
// HttpOnly-Cookie (1 Jahr) -> auf dem iPhone-Homescreen-WebApp bleibt man
// angemeldet, auch nach Schliessen der App. Erneute Eingabe nur, wenn das
// Cookie fehlt/ablaeuft.
// Echte Werte kommen via docker-compose aus der (gitignorierten) .env.
// Die Defaults sind nur harmlose Platzhalter, damit nichts Geheimes im Repo liegt.
const APP_PASSWORD   = process.env.APP_PASSWORD || 'changeme';
const AUTH_SECRET    = process.env.AUTH_SECRET  || 'dev-only-insecure-secret-change-me';
const COOKIE_NAME    = 'at_auth';
const COOKIE_PATH    = '/tracker'; // App laeuft unter autoscanner.space/tracker
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 Jahr
// Cookie-Wert = HMAC des Passworts. Ohne AUTH_SECRET nicht faelschbar.
const AUTH_TOKEN = crypto.createHash('sha256').update(APP_PASSWORD + '|' + AUTH_SECRET).digest('hex');

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] === AUTH_TOKEN;
}

app.use(cors());
// 50mb: PDFs werden (anders als Bilder) ungekuerzt als Base64 geschickt.
// Muss zum client_max_body_size in der nginx-Config passen.
app.use(express.json({ limit: '50mb' }));
// Zu grosse Uploads sauber als JSON melden (statt HTML-Fehlerseite)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Datei zu groß (max. ~50 MB).' });
  }
  next(err);
});

// Login: Passwort pruefen, bei Erfolg langlebiges Cookie setzen.
// (Steht VOR dem Gate, damit es ohne Anmeldung erreichbar ist.)
app.post('/api/login', async (req, res) => {
  const pw = (req.body && req.body.password) || '';
  if (pw === APP_PASSWORD) {
    res.cookie(COOKIE_NAME, AUTH_TOKEN, {
      httpOnly: true, secure: true, sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE, path: COOKIE_PATH
    });
    return res.json({ success: true });
  }
  await new Promise(r => setTimeout(r, 600)); // kleiner Bremsklotz gegen Brute-Force
  res.status(401).json({ error: 'Falsches Passwort' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
  res.json({ success: true });
});

// Auth-Gate: ab hier ist alles geschuetzt.
app.use((req, res, next) => {
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Nicht angemeldet' });
  // Jede Seiten-/Datei-Anfrage ohne Login -> Login-Seite ausliefern
  return res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
// Hochgeladene Dateien statisch ausliefern (URLs sehen aus wie /uploads/<carId>/<datei>)
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── HELPER ────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

function getPartners() {
  // Partner sind fix: Mert & Tobias – wir berechnen Erstattungen dynamisch
  return [
    { id: 'mert', name: 'Mert', openReimbursement: 0 },
    { id: 'tobias', name: 'Tobias', openReimbursement: 0 }
  ];
}

// Wiederkehrende Kosten materialisieren: erzeugt fuer jede aktive Regel die
// fehlenden Monatsbuchungen vom zuletzt gebuchten Monat (last_period) bis zum
// aktuellen Monat. Idempotent & selbstheilend (holt auch nach, falls der Server
// laenger aus war). Das Wasserzeichen last_period verhindert, dass eine vom User
// geloeschte Monatsbuchung beim naechsten Aufruf wieder auftaucht.
function materializeRecurring() {
  const rules = db.getRecurringExpensesActive();
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth(); // 0-basiert

  for (const rule of rules) {
    const start = new Date((rule.start_date || '') + 'T00:00:00');
    if (isNaN(start.getTime())) continue;

    // Startmonat bestimmen: ab last_period+1, sonst ab Startdatum
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
      db.insertGeneralExpense({
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
      db.updateRecurringExpense(rule.id, { last_period: lastPeriod });
    }
  }
}

function recalculate() {
  // Faellige wiederkehrende Kosten zuerst buchen, damit sie hier mitzaehlen
  materializeRecurring();

  const cars = db.getCars();
  const potTransactions = db.getPotTransactions();
  const generalExpenses = db.getGeneralExpenses();

  const partners = getPartners();

  let potBalance = 0;
  (potTransactions || []).forEach(t => {
    if (t.type === 'deposit') potBalance += t.amount;
    else if (t.type === 'withdrawal') potBalance -= t.amount;
  });

  let totalRevenue = 0, totalInvested = 0;

  (cars || []).forEach(car => {
    // Besichtigte Autos beeinflussen den Pot NICHT (nur ihre Ausgaben zählen)
    const istBesichtigt = car.status === 'visited';

    if (car.purchase_price && !istBesichtigt) {
      // 'none' oder leer wird wie 'pot' behandelt (Standardfall)
      const funding = (car.purchase_funding === 'private') ? 'private' : 'pot';
      if (funding === 'pot') {
        potBalance -= car.purchase_price;
        totalInvested += car.purchase_price;
      } else if (funding === 'private') {
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
    (car.expenses || []).forEach(exp => {
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
    });
    if (car.status === 'sold' && car.actual_sell_price) {
      potBalance += car.actual_sell_price;
      totalRevenue += car.actual_sell_price;
    }
  });

  // Allgemeine Kosten (Server, Werkzeug ...): gleicher Geldfluss wie Auto-Ausgaben
  let totalOverhead = 0;
  (generalExpenses || []).forEach(g => {
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
  });

  return {
    potBalance: round2(potBalance),
    totalInvested: round2(totalInvested),
    totalRevenue: round2(totalRevenue),
    totalOverhead: round2(totalOverhead),
    partners,
    cars: cars || []
  };
}

// Datenbankzeile → Frontend-Format
function dbCarToFrontend(car) {
  return {
    id: car.id,
    brand: car.brand,
    model: car.model,
    year: car.year,
    mileage: car.mileage,
    color: car.color,
    fuel: car.fuel,
    transmission: car.transmission,
    horsepower: car.horsepower,
    vin: car.vin,
    listedBuyPrice: car.listed_buy_price,
    purchasePrice: car.purchase_price,
    purchaseFunding: car.purchase_funding,
    purchasePaidBy: car.purchase_paid_by,
    purchaseReimbursed: car.purchase_reimbursed,
    targetSellPrice: car.target_sell_price,
    listedSellPrice: car.listed_sell_price,
    actualSellPrice: car.actual_sell_price,
    purchaseDate: car.purchase_date,
    saleDate: car.sale_date,
    sourcePlatform: car.source_platform,
    sourceLink: car.source_link,
    sellerName: car.seller_name,
    sellerContact: car.seller_contact,
    buyerName: car.buyer_name,
    buyerContact: car.buyer_contact,
    status: car.status,
    notes: car.notes,
    previousOwners: car.previous_owners,
    serviceHistory: car.service_history,
    lastServiceDate: car.last_service_date,
    lastServiceKm: car.last_service_km,
    expenses: car.expenses || [],
    statusHistory: car.status_history || [],
    photos: car.photos || [],
    createdAt: car.created_at
  };
}

// Frontend-Format → Datenbankzeile
function frontendCarToDB(data) {
  const row = {};
  if (data.brand !== undefined) row.brand = data.brand;
  if (data.model !== undefined) row.model = data.model;
  if (data.year !== undefined) row.year = data.year;
  if (data.mileage !== undefined) row.mileage = data.mileage;
  if (data.color !== undefined) row.color = data.color;
  if (data.fuel !== undefined) row.fuel = data.fuel;
  if (data.transmission !== undefined) row.transmission = data.transmission;
  if (data.horsepower !== undefined) row.horsepower = data.horsepower;
  if (data.vin !== undefined) row.vin = data.vin;
  if (data.listedBuyPrice !== undefined) row.listed_buy_price = data.listedBuyPrice;
  if (data.purchasePrice !== undefined) row.purchase_price = data.purchasePrice;
  if (data.purchaseFunding !== undefined) row.purchase_funding = data.purchaseFunding;
  if (data.purchasePaidBy !== undefined) row.purchase_paid_by = data.purchasePaidBy;
  if (data.purchaseReimbursed !== undefined) row.purchase_reimbursed = data.purchaseReimbursed;
  if (data.targetSellPrice !== undefined) row.target_sell_price = data.targetSellPrice;
  if (data.listedSellPrice !== undefined) row.listed_sell_price = data.listedSellPrice;
  if (data.actualSellPrice !== undefined) row.actual_sell_price = data.actualSellPrice;
  if (data.purchaseDate !== undefined) row.purchase_date = data.purchaseDate || null;
  if (data.saleDate !== undefined) row.sale_date = data.saleDate || null;
  if (data.sourcePlatform !== undefined) row.source_platform = data.sourcePlatform;
  if (data.sourceLink !== undefined) row.source_link = data.sourceLink;
  if (data.sellerName !== undefined) row.seller_name = data.sellerName;
  if (data.sellerContact !== undefined) row.seller_contact = data.sellerContact;
  if (data.buyerName !== undefined) row.buyer_name = data.buyerName;
  if (data.buyerContact !== undefined) row.buyer_contact = data.buyerContact;
  if (data.status !== undefined) row.status = data.status;
  if (data.notes !== undefined) row.notes = data.notes;
  if (data.previousOwners !== undefined) row.previous_owners = data.previousOwners;
  if (data.serviceHistory !== undefined) row.service_history = data.serviceHistory;
  if (data.lastServiceDate !== undefined) row.last_service_date = data.lastServiceDate || null;
  if (data.lastServiceKm !== undefined) row.last_service_km = data.lastServiceKm;
  if (data.expenses !== undefined) row.expenses = data.expenses;
  if (data.statusHistory !== undefined) row.status_history = data.statusHistory;
  if (data.photos !== undefined) row.photos = data.photos;
  return row;
}

// ─── API ROUTES ────────────────────────────────────────────────────────────

// Config für Frontend (früher Supabase Anon Key – jetzt nicht mehr nötig,
// Endpunkt bleibt aus Kompatibilitätsgründen erhalten)
app.get('/api/config', (req, res) => {
  res.json({});
});

// Alle Daten
app.get('/api/data', (req, res) => {
  try {
    const calc = recalculate();
    const cars = db.getCars();
    const potTransactions = db.getPotTransactions();
    res.json({
      cars: (cars || []).map(dbCarToFrontend),
      pot: { balance: calc.potBalance, totalInvested: calc.totalInvested, totalRevenue: calc.totalRevenue, totalOverhead: calc.totalOverhead },
      partners: calc.partners,
      potTransactions: potTransactions || [],
      generalExpenses: db.getGeneralExpensesOrdered(),
      recurringExpenses: db.getRecurringExpenses()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats fürs Dashboard
app.get('/api/stats', (req, res) => {
  try {
    const cars = db.getCars();
    const calc = recalculate();

    const frontendCars = (cars || []).map(dbCarToFrontend);
    const activeCars = frontendCars.filter(c => c.status !== 'sold' && c.status !== 'visited');
    const soldCars = frontendCars.filter(c => c.status === 'sold');

    let totalProfit = 0;
    const profits = [];
    soldCars.forEach(car => {
      const totalCosts = (car.purchasePrice || 0) + (car.expenses || []).reduce((s, e) => s + e.amount, 0);
      const profit = (car.actualSellPrice || 0) - totalCosts;
      totalProfit += profit;
      profits.push(profit);
    });
    const avgProfit = profits.length > 0 ? totalProfit / profits.length : 0;

    let avgDays = 0;
    if (soldCars.length > 0) {
      const totalDays = soldCars.reduce((sum, car) => {
        if (car.purchaseDate && car.saleDate) {
          return sum + Math.ceil((new Date(car.saleDate) - new Date(car.purchaseDate)) / 86400000);
        }
        return sum;
      }, 0);
      avgDays = Math.round(totalDays / soldCars.length);
    }

    res.json({
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
      // Netto-Gewinn = reiner Auto-Handelsgewinn minus Betriebskosten
      netProfit: round2(totalProfit - calc.totalOverhead)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alle Autos
app.get('/api/cars', (req, res) => {
  try {
    const data = db.getCarsOrdered();
    res.json((data || []).map(dbCarToFrontend));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ein Auto
app.get('/api/cars/:id', (req, res) => {
  try {
    const data = db.getCar(req.params.id);
    if (!data) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto anlegen
app.post('/api/cars', (req, res) => {
  try {
    const id = 'car_' + Date.now();
    const row = {
      id,
      brand: req.body.brand || '',
      model: req.body.model || '',
      year: req.body.year || null,
      mileage: req.body.mileage || null,
      color: req.body.color || '',
      fuel: req.body.fuel || '',
      transmission: req.body.transmission || '',
      horsepower: req.body.horsepower || null,
      vin: req.body.vin || '',
      listed_buy_price: req.body.listedBuyPrice || null,
      purchase_price: req.body.purchasePrice || null,
      purchase_funding: req.body.purchaseFunding || 'pot',
      purchase_paid_by: req.body.purchasePaidBy || '',
      purchase_reimbursed: false,
      target_sell_price: req.body.targetSellPrice || null,
      listed_sell_price: req.body.listedSellPrice || null,
      actual_sell_price: null,
      purchase_date: req.body.purchaseDate || null,
      sale_date: null,
      source_platform: req.body.sourcePlatform || '',
      source_link: req.body.sourceLink || '',
      seller_name: req.body.sellerName || '',
      seller_contact: req.body.sellerContact || '',
      buyer_name: '',
      buyer_contact: '',
      status: req.body.status || 'purchased',
      notes: req.body.notes || '',
      previous_owners: req.body.previousOwners || null,
      service_history: req.body.serviceHistory || '',
      last_service_date: req.body.lastServiceDate || null,
      last_service_km: req.body.lastServiceKm || null,
      expenses: [],
      status_history: [{ status: req.body.status || 'purchased', date: new Date().toISOString(), note: 'Auto angelegt' }],
      photos: [],
      created_at: new Date().toISOString()
    };
    const data = db.insertCar(row);
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto bearbeiten
app.put('/api/cars/:id', (req, res) => {
  try {
    const existing = db.getCar(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

    const updates = frontendCarToDB(req.body);

    // Status History aktualisieren
    if (req.body.status && req.body.status !== existing.status) {
      const history = existing.status_history || [];
      history.push({ status: req.body.status, date: new Date().toISOString(), note: req.body.statusNote || '' });
      updates.status_history = history;
    }

    const data = db.updateCar(req.params.id, updates);
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto löschen
app.delete('/api/cars/:id', (req, res) => {
  try {
    db.deleteCar(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ausgabe hinzufügen
app.post('/api/cars/:id/expenses', (req, res) => {
  try {
    const car = db.getCar(req.params.id);
    if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

    const expense = {
      id: 'exp_' + Date.now(),
      category: req.body.category || 'sonstiges',
      amount: req.body.amount || 0,
      paidBy: req.body.paidBy || '',
      fundingSource: req.body.fundingSource || 'pot',
      date: req.body.date || new Date().toISOString().split('T')[0],
      note: req.body.note || '',
      reimbursed: false,
      createdAt: new Date().toISOString()
    };

    const expenses = [...(car.expenses || []), expense];
    db.updateCar(req.params.id, { expenses });
    res.json(expense);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ausgabe löschen
app.delete('/api/cars/:carId/expenses/:expId', (req, res) => {
  try {
    const car = db.getCar(req.params.carId);
    if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

    const expenses = (car.expenses || []).filter(e => e.id !== req.params.expId);
    db.updateCar(req.params.carId, { expenses });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ausgabe erstatten
app.post('/api/cars/:carId/expenses/:expId/reimburse', (req, res) => {
  try {
    const car = db.getCar(req.params.carId);
    if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

    const expenses = (car.expenses || []).map(e => {
      if (e.id === req.params.expId) {
        return { ...e, reimbursed: true, reimbursedDate: new Date().toISOString().split('T')[0] };
      }
      return e;
    });
    const expense = expenses.find(e => e.id === req.params.expId);
    db.updateCar(req.params.carId, { expenses });
    res.json(expense);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kaufpreis erstatten
app.post('/api/cars/:id/reimburse-purchase', (req, res) => {
  try {
    const existing = db.getCar(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
    const data = db.updateCar(req.params.id, { purchase_reimbursed: true });
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto verkaufen
app.post('/api/cars/:id/sell', (req, res) => {
  try {
    const car = db.getCar(req.params.id);
    if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

    const history = car.status_history || [];
    const sellPrice = req.body.actualSellPrice || 0;
    history.push({ status: 'sold', date: new Date().toISOString(), note: 'Verkauft für ' + sellPrice + ' Euro' });

    const data = db.updateCar(req.params.id, {
      actual_sell_price: sellPrice,
      sale_date: req.body.saleDate || new Date().toISOString().split('T')[0],
      buyer_name: req.body.buyerName || '',
      buyer_contact: req.body.buyerContact || '',
      status: 'sold',
      status_history: history
    });
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Einzahlung
app.post('/api/pot/deposit', (req, res) => {
  try {
    const transaction = {
      id: 'pot_' + Date.now(),
      type: 'deposit',
      amount: req.body.amount || 0,
      partner_id: req.body.partnerId || '',
      date: req.body.date || new Date().toISOString().split('T')[0],
      note: req.body.note || '',
      created_at: new Date().toISOString()
    };
    const data = db.insertPotTransaction(transaction);
    res.json({ ...data, partnerId: data.partner_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Entnahme / Auszahlung (Gegenstueck zur Einzahlung)
app.post('/api/pot/withdraw', (req, res) => {
  try {
    const transaction = {
      id: 'pot_' + Date.now(),
      type: 'withdrawal',
      amount: req.body.amount || 0,
      partner_id: req.body.partnerId || '',
      date: req.body.date || new Date().toISOString().split('T')[0],
      note: req.body.note || '',
      created_at: new Date().toISOString()
    };
    const data = db.insertPotTransaction(transaction);
    res.json({ ...data, partnerId: data.partner_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Transaktionen laden
app.get('/api/pot/transactions', (req, res) => {
  try {
    const data = db.getPotTransactionsOrdered();
    // partnerId für Frontend mappen
    res.json((data || []).map(t => ({ ...t, partnerId: t.partner_id })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Transaktion löschen
app.delete('/api/pot/transactions/:id', (req, res) => {
  try {
    db.deletePotTransaction(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ALLGEMEINE KOSTEN (autofrei: Server, Werkzeug, Miete ...) ───────────────

// Liste: einzelne Buchungen + wiederkehrende Regeln + Summe
app.get('/api/general-expenses', (req, res) => {
  try {
    const calc = recalculate(); // bucht faellige wiederkehrende Kosten nach
    res.json({
      expenses: db.getGeneralExpensesOrdered(),
      recurring: db.getRecurringExpenses(),
      totalOverhead: calc.totalOverhead
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Einzelne (einmalige) Kosten anlegen
app.post('/api/general-expenses', (req, res) => {
  try {
    const expense = {
      id: 'gexp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      category: req.body.category || 'sonstiges',
      amount: req.body.amount || 0,
      funding_source: req.body.fundingSource || 'pot',
      paid_by: req.body.fundingSource === 'private' ? (req.body.paidBy || '') : '',
      reimbursed: 0,
      reimbursed_date: null,
      date: req.body.date || new Date().toISOString().split('T')[0],
      note: req.body.note || '',
      recurring_id: null,
      auto_generated: 0,
      period: null,
      created_at: new Date().toISOString()
    };
    const data = db.insertGeneralExpense(expense);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kosten löschen
app.delete('/api/general-expenses/:id', (req, res) => {
  try {
    db.deleteGeneralExpense(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kosten als erstattet markieren (nur bei private relevant)
app.post('/api/general-expenses/:id/reimburse', (req, res) => {
  try {
    const exp = db.getGeneralExpense(req.params.id);
    if (!exp) return res.status(404).json({ error: 'Nicht gefunden' });
    const data = db.updateGeneralExpense(req.params.id, {
      reimbursed: 1,
      reimbursed_date: new Date().toISOString().split('T')[0]
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── WIEDERKEHRENDE KOSTEN-REGELN ────────────────────────────────────────────

// Regel anlegen (und sofort faellige Monate nachbuchen)
app.post('/api/recurring-expenses', (req, res) => {
  try {
    const rule = {
      id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      category: req.body.category || 'sonstiges',
      amount: req.body.amount || 0,
      funding_source: req.body.fundingSource || 'pot',
      paid_by: req.body.fundingSource === 'private' ? (req.body.paidBy || '') : '',
      day_of_month: Math.min(Math.max(parseInt(req.body.dayOfMonth) || 1, 1), 28),
      start_date: req.body.startDate || new Date().toISOString().split('T')[0],
      active: 1,
      note: req.body.note || '',
      last_period: null,
      created_at: new Date().toISOString()
    };
    db.insertRecurringExpense(rule);
    materializeRecurring(); // vergangene + aktuellen Monat sofort buchen
    res.json(db.getRecurringExpense(rule.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Regel stoppen: keine neuen Monatsbuchungen mehr, bestehende bleiben erhalten
app.post('/api/recurring-expenses/:id/stop', (req, res) => {
  try {
    const rule = db.getRecurringExpense(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Nicht gefunden' });
    const data = db.updateRecurringExpense(req.params.id, { active: 0 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Regel komplett löschen. ?withBookings=1 entfernt auch alle automatisch
// erzeugten Buchungen dieser Regel (Voll-Rückgängig, z.B. bei Fehleingabe).
app.delete('/api/recurring-expenses/:id', (req, res) => {
  try {
    if (req.query.withBookings === '1') {
      db.deleteGeneralExpensesByRecurring(req.params.id);
    }
    db.deleteRecurringExpense(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Datei hochladen (Foto oder PDF → lokaler Ordner data/uploads)
app.post('/api/cars/:id/photos/upload', (req, res) => {
  try {
    const car = db.getCar(req.params.id);
    if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

    const { imageData, pdfData, fileName, type } = req.body;
    const isPdf  = type === 'pdf' && pdfData;
    const rawB64 = isPdf ? pdfData : imageData;
    if (!rawB64) return res.status(400).json({ error: 'Keine Datei' });

    const base64 = rawB64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    console.log(`📦 ${isPdf ? 'PDF' : 'Foto'} Upload:`, Math.round(buffer.length / 1024), 'KB');

    const ext      = isPdf ? 'pdf' : (fileName || 'foto.jpg').split('.').pop().toLowerCase();
    const safeFile = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    // Pro Auto ein Unterordner: data/uploads/<carId>/<datei>
    const carDir = path.join(UPLOADS_DIR, req.params.id);
    fs.mkdirSync(carDir, { recursive: true });
    fs.writeFileSync(path.join(carDir, safeFile), buffer);

    // Öffentliche URL (relativ, wird von express.static unter /uploads bedient)
    const publicUrl = `/uploads/${req.params.id}/${safeFile}`;

    // PDFs als "name|pdf|url" speichern damit Frontend den Dateinamen kennt
    const safeName  = (fileName || 'Dokument').replace(/[|]/g, '_').replace(/\.pdf$/i, '');
    const storedUrl = isPdf ? `${safeName}|pdf|${publicUrl}` : publicUrl;

    const photos = [...(car.photos || []), storedUrl];
    const data = db.updateCar(req.params.id, { photos });

    console.log('✅ Gespeichert:', isPdf ? 'PDF' : 'Foto', photos.length, 'Dateien gesamt');
    res.json(dbCarToFrontend(data));
  } catch (e) {
    console.error('Upload Fehler:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Foto löschen
app.delete('/api/cars/:id/photos', (req, res) => {
  try {
    const car = db.getCar(req.params.id);
    if (!car) return res.status(404).json({ error: 'Nicht gefunden' });

    const { url } = req.body;
    // Aus lokalem Speicher löschen. url kann "name|pdf|/uploads/..." oder "/uploads/..." sein.
    const rawUrl   = url && url.includes('|pdf|') ? url.split('|pdf|')[1] : url;
    const pathPart = rawUrl && rawUrl.split('/uploads/')[1];
    if (pathPart) {
      const filePath = path.join(UPLOADS_DIR, pathPart);
      // Sicherheitscheck: Pfad muss innerhalb von UPLOADS_DIR liegen
      if (filePath.startsWith(UPLOADS_DIR) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { console.error('Datei-Löschfehler:', err.message); }
      }
    }

    const photos = (car.photos || []).filter(u => u !== url);
    const data = db.updateCar(req.params.id, { photos });
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Catch-all für SPA
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Auto-Tracker läuft auf http://localhost:' + PORT);
});
