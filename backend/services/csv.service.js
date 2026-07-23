// =============================================================================
//  services/csv.service.js
//  -----------------------------------------------------------------------------
//  Gera CSV em UTF-8 com BOM (Excel abre corretamente com acentos) e aplica
//  escape RFC 4180 (aspas duplicadas para conter vírgula/aspas/quebras).
// =============================================================================

function escapeCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Se contém vírgula, aspas ou quebra de linha, envolve em aspas
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * columns: [{ key, label, get(row), numeric? }]
 * rows: array de objetos
 */
export function buildCsv(columns, rows) {
  const lines = [];
  lines.push(columns.map((c) => escapeCell(c.label)).join(","));
  for (const r of rows) {
    lines.push(columns.map((c) => {
      let v;
      try { v = c.get(r); } catch (e) { v = ""; }
      if (c.numeric && (v === null || v === undefined || v === "")) v = 0;
      if (c.numeric) v = String(v).replace(".", ",");
      return escapeCell(v);
    }).join(","));
  }
  // BOM + CRLF (Excel-friendly)
  return "﻿" + lines.join("\r\n") + "\r\n";
}
