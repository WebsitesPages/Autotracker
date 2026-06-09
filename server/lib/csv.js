// CSV-Export im deutschen Excel-Format: Semikolon-getrennt, UTF-8 mit BOM,
// Dezimal-Komma bei Betraegen.
function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(';')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

// Zahl als deutsches Dezimalformat (Komma), damit Excel sie direkt erkennt
function deNum(n) {
  if (n === null || n === undefined || n === '') return '';
  return String(n).replace('.', ',');
}

function sendCsv(res, filename, content) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}

module.exports = { toCsv, deNum, sendCsv };
