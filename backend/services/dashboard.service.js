// =============================================================================
//  services/dashboard.service.js — agregados para o dashboard
//  =============================================================================
import { db } from "../db/index.js";

function safeQuery(sql, params = []) {
  try { return db.prepare(sql).all(...params); } catch (e) { return []; }
}

export function kpis() {
  const now = new Date();
  const mes = now.toISOString().slice(0, 7);
  const hoje = now.toISOString().slice(0, 10);

  const total = safeQuery("SELECT COUNT(*) as c FROM documents")[0]?.c || 0;
  const totalNFe = safeQuery("SELECT COUNT(*) as c FROM documents WHERE kind = 'NFE'")[0]?.c || 0;
  const totalCTe = safeQuery("SELECT COUNT(*) as c FROM documents WHERE kind = 'CTE'")[0]?.c || 0;
  const cancelados = safeQuery("SELECT COUNT(*) as c FROM documents WHERE status = 'cancelado'")[0]?.c || 0;
  const valorTotal = safeQuery("SELECT COALESCE(SUM(CAST(valor_total AS REAL)), 0) as v FROM documents")[0]?.v || 0;
  const valorAutorizado = safeQuery("SELECT COALESCE(SUM(CAST(valor_total AS REAL)), 0) as v FROM documents WHERE status = 'autorizado'")[0]?.v || 0;

  const valorMes = safeQuery("SELECT COALESCE(SUM(CAST(valor_total AS REAL)), 0) as v FROM documents WHERE substr(data_emissao, 1, 7) = ? AND status = 'autorizado'", [mes])[0]?.v || 0;
  const docsMes = safeQuery("SELECT COUNT(*) as c FROM documents WHERE substr(data_emissao, 1, 7) = ?", [mes])[0]?.c || 0;
  const docsHoje = safeQuery("SELECT COUNT(*) as c FROM documents WHERE substr(data_emissao, 1, 10) = ?", [hoje])[0]?.c || 0;

  return {
    total, totalNFe, totalCTe, cancelados,
    valorTotal, valorAutorizado,
    valorMes, docsMes, docsHoje,
  };
}

export function porMes(ultimos = 12) {
  const rows = safeQuery(`
    SELECT substr(data_emissao, 1, 7) as ym,
           COUNT(*) as qtd,
           COALESCE(SUM(CAST(valor_total AS REAL)), 0) as valor,
           SUM(CASE WHEN kind = 'NFE' THEN 1 ELSE 0 END) as qtd_nfe,
           SUM(CASE WHEN kind = 'CTE' THEN 1 ELSE 0 END) as qtd_cte
    FROM documents
    WHERE data_emissao IS NOT NULL AND data_emissao <> ''
    GROUP BY ym
    ORDER BY ym DESC
    LIMIT ?
  `, [Number(ultimos) || 12]);
  return rows.reverse(); // ordem cronológica
}

export function porUf() {
  const rows = safeQuery(`
    SELECT uf_emitente as uf, COUNT(*) as qtd,
           COALESCE(SUM(CAST(valor_total AS REAL)), 0) as valor
    FROM documents
    WHERE uf_emitente IS NOT NULL AND uf_emitente <> ''
    GROUP BY uf_emitente
    ORDER BY qtd DESC
    LIMIT 27
  `);
  return rows;
}

export function topParceiros({ papel = "destinatario", limite = 10 } = {}) {
  const coluna = papel === "remetente" ? "remetente_nome" : "destinatario_nome";
  const rows = safeQuery(`
    SELECT ${coluna} as nome, COUNT(*) as qtd,
           COALESCE(SUM(CAST(valor_total AS REAL)), 0) as valor
    FROM documents
    WHERE ${coluna} IS NOT NULL AND ${coluna} <> ''
    GROUP BY ${coluna}
    ORDER BY valor DESC
    LIMIT ?
  `, [Number(limite) || 10]);
  return rows;
}

export function porStatus() {
  return safeQuery(`
    SELECT status, COUNT(*) as qtd
    FROM documents
    GROUP BY status
    ORDER BY qtd DESC
  `);
}
