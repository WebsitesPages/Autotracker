# 🚗 AutoTracker – Mert & Tobias

Auto-Handel Tracking-App: Fahrzeuge, gemeinsame Kasse (Pot), Erstattungen,
Betriebskosten und Auswertungen.

## Architektur

| Teil | Technik |
|---|---|
| Backend | Node.js 20, Express 5, better-sqlite3 (WAL) – modular in `server/` |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS 4 in `client/`, Charts mit Recharts |
| Deployment | Multi-Stage-Docker-Build, nginx-Reverse-Proxy unter `autoscanner.space/tracker` |
| Daten | SQLite in `./data` (Volume), Uploads in `./data/uploads`, tägliche Backups in `./data/backups` |

```
server/
  index.js          Einstieg (Schema, Backups, Listen)
  app.js            Express-Verdrahtung (Security-Header, Auth-Gate, Routen)
  config.js         Konfiguration aus ENV
  db/               SQLite-Verbindung + Repositories (cars, pot, …)
  services/         finance (Pot-Logik, Kennzahlen), audit, backup
  routes/           auth, cars, pot, generalExpenses, stats, exports (CSV)
  middleware/       auth (Cookie-Session, Login-Rate-Limit), errors
  lib/              validate, carMapper, csv
client/
  src/              React-App (Seiten, Modals, UI-Komponenten)
```

## Features

- 📊 **Übersicht**: Pot-Stand, gebundenes Kapital, Netto-Gewinn, Gewinnverlauf pro Monat
- 🚗 **Fahrzeuge**: Anlegen, Besichtigen → Kaufen, Aufbereiten, Inserieren, Verkaufen; Suche + Filter
- 💸 **Ausgaben pro Auto** inkl. Tankkosten-Rechner (Adress-Suche + Routenberechnung)
- 📎 **Fotos & PDFs** pro Auto (komprimierter Upload, Lightbox, PDF-Viewer)
- 💰 **Pot**: Einzahlungen/Entnahmen, offene Erstattungen pro Partner
- 🧾 **Allgemeine Kosten** + monatliche Daueraufträge (automatische Buchung)
- 📈 **Auswertung**: 12-Monats-Chart, Kosten nach Kategorie, Marge pro Auto, CSV-Exporte
- 🔐 **Login** mit Identität (Mert/Tobias), signierte HttpOnly-Cookies, Rate-Limit, Audit-Log
- 💾 **Automatische SQLite-Backups** (täglich, 14 Stände)

## Betrieb (Hetzner)

```bash
# Deployment / Update (baut Frontend + Backend im Docker-Build):
docker compose build && docker compose up -d

# Logs
docker logs -f autotracker
```

Konfiguration über `.env` (siehe `.env.example`): `APP_PASSWORD`, `AUTH_SECRET`.
`COOKIE_PATH=/tracker` ist in `docker-compose.yml` gesetzt, weil die App hinter
nginx unter dem Unterpfad `/tracker` läuft.

## Lokale Entwicklung

```bash
# Backend (Port 3000)
npm install && npm start

# Frontend mit Hot-Reload (Port 5173, proxyt /api auf :3000)
cd client && npm install && npm run dev

# Typecheck + Produktions-Build des Frontends
cd client && npm run typecheck && npm run build
```

## Daten

- SQLite-Datenbank: `data/autotracker.db` (WAL-Modus)
- Tabellen: `cars`, `pot_transactions`, `general_expenses`, `recurring_expenses`, `audit_log`
- Der Pot-Stand wird nie gespeichert, sondern immer live aus allen Buchungen berechnet.
