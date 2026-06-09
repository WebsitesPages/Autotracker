// Mapping zwischen DB-Zeile (snake_case) und API-Format (camelCase).
// Das API-Format ist der bestehende Vertrag mit dem Frontend und bleibt stabil.
const FIELDS = [
  ['brand', 'brand'],
  ['model', 'model'],
  ['year', 'year'],
  ['mileage', 'mileage'],
  ['color', 'color'],
  ['fuel', 'fuel'],
  ['transmission', 'transmission'],
  ['horsepower', 'horsepower'],
  ['vin', 'vin'],
  ['listedBuyPrice', 'listed_buy_price'],
  ['purchasePrice', 'purchase_price'],
  ['purchaseFunding', 'purchase_funding'],
  ['purchasePaidBy', 'purchase_paid_by'],
  ['purchaseReimbursed', 'purchase_reimbursed'],
  ['targetSellPrice', 'target_sell_price'],
  ['listedSellPrice', 'listed_sell_price'],
  ['actualSellPrice', 'actual_sell_price'],
  ['purchaseDate', 'purchase_date'],
  ['saleDate', 'sale_date'],
  ['sourcePlatform', 'source_platform'],
  ['sourceLink', 'source_link'],
  ['sellerName', 'seller_name'],
  ['sellerContact', 'seller_contact'],
  ['buyerName', 'buyer_name'],
  ['buyerContact', 'buyer_contact'],
  ['status', 'status'],
  ['notes', 'notes'],
  ['previousOwners', 'previous_owners'],
  ['serviceHistory', 'service_history'],
  ['lastServiceDate', 'last_service_date'],
  ['lastServiceKm', 'last_service_km'],
  ['expenses', 'expenses'],
  ['statusHistory', 'status_history'],
  ['photos', 'photos']
];

// Felder, bei denen ein leerer String als NULL gespeichert werden soll (Datumsfelder)
const NULL_IF_EMPTY = new Set(['purchase_date', 'sale_date', 'last_service_date']);

function toApi(car) {
  const out = { id: car.id, createdAt: car.created_at };
  for (const [api, db] of FIELDS) {
    out[api] = car[db];
  }
  out.expenses = car.expenses || [];
  out.statusHistory = car.status_history || [];
  out.photos = car.photos || [];
  return out;
}

function toDbUpdates(data) {
  const row = {};
  for (const [api, db] of FIELDS) {
    if (data[api] !== undefined) {
      row[db] = NULL_IF_EMPTY.has(db) ? (data[api] || null) : data[api];
    }
  }
  return row;
}

module.exports = { toApi, toDbUpdates };
