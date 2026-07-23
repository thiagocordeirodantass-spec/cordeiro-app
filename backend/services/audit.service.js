// =============================================================================
//  services/audit.service.js — histórico/auditoria de relatórios gerados
//  -----------------------------------------------------------------------------
//  Guarda os FILTROS aplicados (não o arquivo binário) + metadados.
//  Para "re-baixar", basta aplicar os mesmos filtros e gerar novamente.
// =============================================================================
import { db } from "../db/index.js";

export function registrar({ userId, username, templateId, formato, filtros, totalDocs, tamanhoBytes }) {
  db.prepare(`
    INSERT INTO relatorio_historico (user_id, username, template_id, formato, filtros, total_docs, tamanho_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId || null,
    username || null,
    templateId || null,
    formato,
    filtros ? JSON.stringify(filtros) : null,
    Number(totalDocs) || 0,
    Number(tamanhoBytes) || null
  );
}

export function listar({ user, limit = 100, todos = false } = {}) {
  // admin pode ver tudo; outros veem só os próprios
  const showAll = todos && user && user.role === "admin";
  const sql = showAll
    ? `SELECT h.*, t.nome as template_nome FROM relatorio_historico h
       LEFT JOIN relatorio_templates t ON t.id = h.template_id
       ORDER BY h.created_at DESC LIMIT ?`
    : `SELECT h.*, t.nome as template_nome FROM relatorio_historico h
       LEFT JOIN relatorio_templates t ON t.id = h.template_id
       WHERE h.user_id = ?
       ORDER BY h.created_at DESC LIMIT ?`;
  const params = showAll ? [Number(limit)] : [user.id, Number(limit)];
  const rows = db.prepare(sql).all(...params);
  return rows.map(deserialize);
}

export function obter(id, user) {
  const row = db.prepare("SELECT * FROM relatorio_historico WHERE id = ?").get(id);
  if (!row) return null;
  if (row.user_id !== user.id && user.role !== "admin") return null;
  return deserialize(row);
}

function deserialize(row) {
  let filtros = null;
  try { filtros = row.filtros ? JSON.parse(row.filtros) : null; } catch (e) {}
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    template_id: row.template_id,
    template_nome: row.template_nome,
    formato: row.formato,
    filtros,
    total_docs: row.total_docs,
    tamanho_bytes: row.tamanho_bytes,
    created_at: row.created_at,
  };
}
