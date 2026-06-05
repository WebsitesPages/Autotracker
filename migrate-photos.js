// ─── Foto-Migration: Supabase Storage → lokale Dateien ───────────────────────
// Lädt alle in der DB referenzierten http(s)-Bild-/PDF-URLs (Supabase Storage)
// herunter, speichert sie unter data/uploads/<carId>/ und schreibt die
// photos-Einträge auf lokale Pfade (/uploads/...) um. Idempotent: bereits
// lokale Einträge (/uploads/...) werden übersprungen.

const path = require('path');
const fs = require('fs');
const db = require('./db');

db.initSchema();

const UPLOADS_DIR = path.join(db.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Content-Type → Datei-Endung
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf'
};

function pickExt(contentType, urlPath, isPdf) {
  if (isPdf) return 'pdf';
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  if (EXT_BY_MIME[ct]) return EXT_BY_MIME[ct];
  const urlExt = (urlPath.split('.').pop() || '').toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(urlExt)) return urlExt;
  return 'bin';
}

// Ein photos-Eintrag kann "name|pdf|url" (PDF) oder "url" (Bild) sein
function splitEntry(entry) {
  if (typeof entry === 'string' && entry.includes('|pdf|')) {
    const [name, , url] = entry.split('|pdf|');
    return { name, url, isPdf: true };
  }
  return { name: null, url: entry, isPdf: entry && /\.pdf(\?|$)/i.test(entry) };
}

async function downloadOne(carId, entry, stats) {
  const { name, url, isPdf } = splitEntry(entry);

  // Schon lokal? -> unverändert lassen
  if (!url || !/^https?:\/\//i.test(url)) {
    stats.skipped++;
    return entry;
  }

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`   ❌ ${res.status} bei ${url}`);
    stats.failed++;
    return entry; // Original behalten, damit nichts verloren geht
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = pickExt(res.headers.get('content-type'), url, isPdf);

  const base = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const carDir = path.join(UPLOADS_DIR, carId);
  fs.mkdirSync(carDir, { recursive: true });
  fs.writeFileSync(path.join(carDir, base), buf);

  const localUrl = `/uploads/${carId}/${base}`;
  console.log(`   ✅ ${Math.round(buf.length / 1024)} KB → ${localUrl}`);
  stats.downloaded++;

  // PDF-Format "name|pdf|url" erhalten
  if (isPdf && name) return `${name}|pdf|${localUrl}`;
  return localUrl;
}

async function main() {
  const cars = db.getCars();
  const stats = { downloaded: 0, skipped: 0, failed: 0, carsUpdated: 0 };

  for (const car of cars) {
    const photos = car.photos || [];
    if (photos.length === 0) continue;

    let changed = false;
    const newPhotos = [];
    console.log(`🚗 ${car.brand} ${car.model} (${photos.length} Dateien)`);
    for (const entry of photos) {
      const out = await downloadOne(car.id, entry, stats);
      if (out !== entry) changed = true;
      newPhotos.push(out);
    }
    if (changed) {
      db.updateCar(car.id, { photos: newPhotos });
      stats.carsUpdated++;
    }
  }

  console.log('');
  console.log('✅ Foto-Migration abgeschlossen.');
  console.log(`   ⬇️  Heruntergeladen:        ${stats.downloaded}`);
  console.log(`   ⏭️  Übersprungen (lokal):   ${stats.skipped}`);
  console.log(`   ❌ Fehlgeschlagen:         ${stats.failed}`);
  console.log(`   🚗 Autos aktualisiert:     ${stats.carsUpdated}`);
}

main().catch(e => { console.error('Abbruch:', e); process.exit(1); });
