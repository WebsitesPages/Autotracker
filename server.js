const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
 
const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');
 
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
 
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
 
function getDefaultDB() {
  return {
    cars: [],
    pot: { balance: 0, totalInvested: 0, totalRevenue: 0 },
    partners: [
      { id: 'mert', name: 'Mert', openReimbursement: 0 },
      { id: 'tobias', name: 'Tobias', openReimbursement: 0 }
    ],
    potTransactions: []
  };
}
 
function readDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('DB read error:', e);
  }
  const db = getDefaultDB();
  writeDB(db);
  return db;
}
 
function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
 
function recalculate(db) {
  db.partners.forEach(p => p.openReimbursement = 0);
  let potBalance = 0;
  db.potTransactions.forEach(t => {
    if (t.type === 'deposit') potBalance += t.amount;
  });
 
  let totalRevenue = 0, totalInvested = 0;
 
  db.cars.forEach(car => {
    if (car.purchasePrice) {
      if (car.purchaseFunding === 'pot') {
        potBalance -= car.purchasePrice;
        totalInvested += car.purchasePrice;
      } else if (car.purchaseFunding === 'private') {
        totalInvested += car.purchasePrice;
        const partner = db.partners.find(p => p.id === car.purchasePaidBy);
        if (partner) {
          if (!car.purchaseReimbursed) {
            partner.openReimbursement += car.purchasePrice;
          } else {
            potBalance -= car.purchasePrice;
          }
        }
      }
    }
    if (car.expenses) {
      car.expenses.forEach(exp => {
        if (exp.fundingSource === 'pot') {
          potBalance -= exp.amount;
        } else if (exp.fundingSource === 'private') {
          const partner = db.partners.find(p => p.id === exp.paidBy);
          if (partner) {
            if (!exp.reimbursed) {
              partner.openReimbursement += exp.amount;
            } else {
              potBalance -= exp.amount;
            }
          }
        }
      });
    }
    if (car.status === 'sold' && car.actualSellPrice) {
      potBalance += car.actualSellPrice;
      totalRevenue += car.actualSellPrice;
    }
  });
 
  db.pot.balance = Math.round(potBalance * 100) / 100;
  db.pot.totalInvested = Math.round(totalInvested * 100) / 100;
  db.pot.totalRevenue = Math.round(totalRevenue * 100) / 100;
  return db;
}
 
// API Routes
app.get('/api/data', (req, res) => {
  const db = readDB(); recalculate(db); writeDB(db); res.json(db);
});
 
app.get('/api/stats', (req, res) => {
  const db = readDB(); recalculate(db);
  const activeCars = db.cars.filter(c => c.status !== 'sold');
  const soldCars = db.cars.filter(c => c.status === 'sold');
  let totalProfit = 0; const profits = [];
  soldCars.forEach(car => {
    const totalCosts = (car.purchasePrice || 0) + (car.expenses || []).reduce((s, e) => s + e.amount, 0);
    const profit = (car.actualSellPrice || 0) - totalCosts;
    totalProfit += profit; profits.push(profit);
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
    potBalance: db.pot.balance, activeCars: activeCars.length, soldCars: soldCars.length,
    totalProfit: Math.round(totalProfit * 100) / 100, avgProfit: Math.round(avgProfit * 100) / 100,
    avgDays, partners: db.partners, totalInvested: db.pot.totalInvested, totalRevenue: db.pot.totalRevenue
  });
});
 
app.get('/api/cars', (req, res) => { res.json(readDB().cars); });
 
app.get('/api/cars/:id', (req, res) => {
  const car = readDB().cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(car);
});
 
app.post('/api/cars', (req, res) => {
  const db = readDB();
  const car = {
    id: 'car_' + Date.now(), brand: req.body.brand || '', model: req.body.model || '',
    year: req.body.year || null, mileage: req.body.mileage || null, color: req.body.color || '',
    fuel: req.body.fuel || '', transmission: req.body.transmission || '',
    horsepower: req.body.horsepower || null, vin: req.body.vin || '',
    listedBuyPrice: req.body.listedBuyPrice || null, purchasePrice: req.body.purchasePrice || null,
    purchaseFunding: req.body.purchaseFunding || 'pot', purchasePaidBy: req.body.purchasePaidBy || '',
    purchaseReimbursed: false, targetSellPrice: req.body.targetSellPrice || null,
    listedSellPrice: req.body.listedSellPrice || null, actualSellPrice: null,
    purchaseDate: req.body.purchaseDate || null, saleDate: null,
    sourcePlatform: req.body.sourcePlatform || '', sourceLink: req.body.sourceLink || '',
    sellerName: req.body.sellerName || '', sellerContact: req.body.sellerContact || '',
    buyerName: '', buyerContact: '', status: req.body.status || 'purchased',
    notes: req.body.notes || '', expenses: [],
    statusHistory: [{ status: req.body.status || 'purchased', date: new Date().toISOString(), note: 'Auto angelegt' }],
    createdAt: new Date().toISOString()
  };
  db.cars.push(car); recalculate(db); writeDB(db); res.json(car);
});
 
app.put('/api/cars/:id', (req, res) => {
  const db = readDB();
  const idx = db.cars.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
  const oldStatus = db.cars[idx].status;
  const updated = { ...db.cars[idx], ...req.body };
  if (req.body.status && req.body.status !== oldStatus) {
    if (!updated.statusHistory) updated.statusHistory = [];
    updated.statusHistory.push({ status: req.body.status, date: new Date().toISOString(), note: req.body.statusNote || '' });
  }
  db.cars[idx] = updated; recalculate(db); writeDB(db); res.json(updated);
});
 
app.delete('/api/cars/:id', (req, res) => {
  const db = readDB(); db.cars = db.cars.filter(c => c.id !== req.params.id);
  recalculate(db); writeDB(db); res.json({ success: true });
});
 
app.post('/api/cars/:id/expenses', (req, res) => {
  const db = readDB();
  const car = db.cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  const expense = {
    id: 'exp_' + Date.now(), category: req.body.category || 'sonstiges',
    amount: req.body.amount || 0, paidBy: req.body.paidBy || '',
    fundingSource: req.body.fundingSource || 'pot',
    date: req.body.date || new Date().toISOString().split('T')[0],
    note: req.body.note || '', reimbursed: false, createdAt: new Date().toISOString()
  };
  if (!car.expenses) car.expenses = [];
  car.expenses.push(expense); recalculate(db); writeDB(db); res.json(expense);
});
 
app.delete('/api/cars/:carId/expenses/:expId', (req, res) => {
  const db = readDB();
  const car = db.cars.find(c => c.id === req.params.carId);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  car.expenses = (car.expenses || []).filter(e => e.id !== req.params.expId);
  recalculate(db); writeDB(db); res.json({ success: true });
});
 
app.post('/api/cars/:carId/expenses/:expId/reimburse', (req, res) => {
  const db = readDB();
  const car = db.cars.find(c => c.id === req.params.carId);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  const expense = (car.expenses || []).find(e => e.id === req.params.expId);
  if (!expense) return res.status(404).json({ error: 'Ausgabe nicht gefunden' });
  expense.reimbursed = true; expense.reimbursedDate = new Date().toISOString().split('T')[0];
  recalculate(db); writeDB(db); res.json(expense);
});
 
app.post('/api/cars/:id/reimburse-purchase', (req, res) => {
  const db = readDB();
  const car = db.cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  car.purchaseReimbursed = true; recalculate(db); writeDB(db); res.json(car);
});
 
app.post('/api/pot/deposit', (req, res) => {
  const db = readDB();
  const t = {
    id: 'pot_' + Date.now(), type: 'deposit', amount: req.body.amount || 0,
    partnerId: req.body.partnerId || '', date: req.body.date || new Date().toISOString().split('T')[0],
    note: req.body.note || '', createdAt: new Date().toISOString()
  };
  db.potTransactions.push(t); recalculate(db); writeDB(db); res.json(t);
});
 
app.get('/api/pot/transactions', (req, res) => { res.json(readDB().potTransactions); });
 
app.delete('/api/pot/transactions/:id', (req, res) => {
  const db = readDB(); db.potTransactions = db.potTransactions.filter(t => t.id !== req.params.id);
  recalculate(db); writeDB(db); res.json({ success: true });
});
 
app.post('/api/cars/:id/sell', (req, res) => {
  const db = readDB();
  const car = db.cars.find(c => c.id === req.params.id);
  if (!car) return res.status(404).json({ error: 'Nicht gefunden' });
  car.actualSellPrice = req.body.actualSellPrice || 0;
  car.saleDate = req.body.saleDate || new Date().toISOString().split('T')[0];
  car.buyerName = req.body.buyerName || ''; car.buyerContact = req.body.buyerContact || '';
  car.status = 'sold';
  if (!car.statusHistory) car.statusHistory = [];
  car.statusHistory.push({ status: 'sold', date: new Date().toISOString(), note: 'Verkauft für ' + car.actualSellPrice + ' Euro' });
  recalculate(db); writeDB(db); res.json(car);
});
 
app.get('/{*splat}', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
 
app.listen(PORT, () => { console.log('Auto-Tracker laeuft auf http://localhost:' + PORT); });