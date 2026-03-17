const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Client – Keys kommen aus Umgebungsvariablen!
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPER ────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

async function getPartners() {
  // Partner sind fix: Mert & Tobias – wir berechnen Erstattungen dynamisch
  return [
    { id: 'mert', name: 'Mert', openReimbursement: 0 },
    { id: 'tobias', name: 'Tobias', openReimbursement: 0 }
  ];
}

async function recalculate() {
  const { data: cars } = await supabase.from('cars').select('*');
  const { data: potTransactions } = await supabase.from('pot_transactions').select('*');

  const partners = await getPartners();

  let potBalance = 0;
  (potTransactions || []).forEach(t => {
    if (t.type === 'deposit') potBalance += t.amount;
  });

  let totalRevenue = 0, totalInvested = 0;

  (cars || []).forEach(car => {
    if (car.purchase_price) {
      if (car.purchase_funding === 'pot') {
        potBalance -= car.purchase_price;
        totalInvested += car.purchase_price;
      } else if (car.purchase_funding === 'private') {
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

  return {
    potBalance: round2(potBalance),
    totalInvested: round2(totalInvested),
    totalRevenue: round2(totalRevenue),
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
  if (data.expenses !== undefined) row.expenses = data.expenses;
  if (data.statusHistory !== undefined) row.status_history = data.statusHistory;
  if (data.photos !== undefined) row.photos = data.photos;
  return row;
}

// ─── API ROUTES ────────────────────────────────────────────────────────────

// Config für Frontend (Supabase Anon Key)
app.get('/api/config', (req, res) => {
  res.json({ anonKey: process.env.SUPABASE_KEY });
});

// Alle Daten
app.get('/api/data', async (req, res) => {
  try {
    const { data: cars } = await supabase.from('cars').select('*');
    const { data: potTransactions } = await supabase.from('pot_transactions').select('*');
    const calc = await recalculate();
    res.json({
      cars: (cars || []).map(dbCarToFrontend),
      pot: { balance: calc.potBalance, totalInvested: calc.totalInvested, totalRevenue: calc.totalRevenue },
      partners: calc.partners,
      potTransactions: potTransactions || []
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats fürs Dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const { data: cars } = await supabase.from('cars').select('*');
    const calc = await recalculate();

    const frontendCars = (cars || []).map(dbCarToFrontend);
    const activeCars = frontendCars.filter(c => c.status !== 'sold');
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
      totalRevenue: calc.totalRevenue
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alle Autos
app.get('/api/cars', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cars').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(dbCarToFrontend));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ein Auto
app.get('/api/cars/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto anlegen
app.post('/api/cars', async (req, res) => {
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
      expenses: [],
      status_history: [{ status: req.body.status || 'purchased', date: new Date().toISOString(), note: 'Auto angelegt' }]
    };
    const { data, error } = await supabase.from('cars').insert(row).select().single();
    if (error) throw error;
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto bearbeiten
app.put('/api/cars/:id', async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Nicht gefunden' });

    const updates = frontendCarToDB(req.body);

    // Status History aktualisieren
    if (req.body.status && req.body.status !== existing.status) {
      const history = existing.status_history || [];
      history.push({ status: req.body.status, date: new Date().toISOString(), note: req.body.statusNote || '' });
      updates.status_history = history;
    }

    const { data, error } = await supabase.from('cars').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto löschen
app.delete('/api/cars/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('cars').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ausgabe hinzufügen
app.post('/api/cars/:id/expenses', async (req, res) => {
  try {
    const { data: car, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (fetchErr || !car) return res.status(404).json({ error: 'Nicht gefunden' });

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
    const { error } = await supabase.from('cars').update({ expenses }).eq('id', req.params.id);
    if (error) throw error;
    res.json(expense);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ausgabe löschen
app.delete('/api/cars/:carId/expenses/:expId', async (req, res) => {
  try {
    const { data: car, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.carId).single();
    if (fetchErr || !car) return res.status(404).json({ error: 'Nicht gefunden' });

    const expenses = (car.expenses || []).filter(e => e.id !== req.params.expId);
    const { error } = await supabase.from('cars').update({ expenses }).eq('id', req.params.carId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ausgabe erstatten
app.post('/api/cars/:carId/expenses/:expId/reimburse', async (req, res) => {
  try {
    const { data: car, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.carId).single();
    if (fetchErr || !car) return res.status(404).json({ error: 'Nicht gefunden' });

    const expenses = (car.expenses || []).map(e => {
      if (e.id === req.params.expId) {
        return { ...e, reimbursed: true, reimbursedDate: new Date().toISOString().split('T')[0] };
      }
      return e;
    });
    const expense = expenses.find(e => e.id === req.params.expId);
    const { error } = await supabase.from('cars').update({ expenses }).eq('id', req.params.carId);
    if (error) throw error;
    res.json(expense);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kaufpreis erstatten
app.post('/api/cars/:id/reimburse-purchase', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cars').update({ purchase_reimbursed: true }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto verkaufen
app.post('/api/cars/:id/sell', async (req, res) => {
  try {
    const { data: car, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (fetchErr || !car) return res.status(404).json({ error: 'Nicht gefunden' });

    const history = car.status_history || [];
    const sellPrice = req.body.actualSellPrice || 0;
    history.push({ status: 'sold', date: new Date().toISOString(), note: 'Verkauft für ' + sellPrice + ' Euro' });

    const { data, error } = await supabase.from('cars').update({
      actual_sell_price: sellPrice,
      sale_date: req.body.saleDate || new Date().toISOString().split('T')[0],
      buyer_name: req.body.buyerName || '',
      buyer_contact: req.body.buyerContact || '',
      status: 'sold',
      status_history: history
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(dbCarToFrontend(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Einzahlung
app.post('/api/pot/deposit', async (req, res) => {
  try {
    const transaction = {
      id: 'pot_' + Date.now(),
      type: 'deposit',
      amount: req.body.amount || 0,
      partner_id: req.body.partnerId || '',
      date: req.body.date || new Date().toISOString().split('T')[0],
      note: req.body.note || ''
    };
    const { data, error } = await supabase.from('pot_transactions').insert(transaction).select().single();
    if (error) throw error;
    res.json({ ...data, partnerId: data.partner_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Transaktionen laden
app.get('/api/pot/transactions', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pot_transactions').select('*').order('date', { ascending: false });
    if (error) throw error;
    // partnerId für Frontend mappen
    res.json((data || []).map(t => ({ ...t, partnerId: t.partner_id })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pot Transaktion löschen
app.delete('/api/pot/transactions/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('pot_transactions').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fotos hinzufügen (URLs nach Upload in Supabase Storage)
app.post('/api/cars/:id/photos', async (req, res) => {
  try {
    const { data: car, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (fetchErr || !car) return res.status(404).json({ error: 'Nicht gefunden' });
    const photos = [...(car.photos || []), req.body.url];
    const { data, error } = await supabase.from('cars').update({ photos }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(dbCarToFrontend(data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Foto löschen
app.delete('/api/cars/:id/photos', async (req, res) => {
  try {
    const { data: car, error: fetchErr } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (fetchErr || !car) return res.status(404).json({ error: 'Nicht gefunden' });
    const photos = (car.photos || []).filter(u => u !== req.body.url);
    const { data, error } = await supabase.from('cars').update({ photos }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(dbCarToFrontend(data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Catch-all für SPA
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Auto-Tracker läuft auf http://localhost:' + PORT);
});
