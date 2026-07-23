// =============================================================================
//  services/templates.service.js — CRUD de templates de relatório
//  -----------------------------------------------------------------------------
//  Valida que `campos` contém apenas chaves válidas (definidas em relatorio.service.js).
// =============================================================================
import { db } from "../db/index.js";
import { CAMPOS_PERMITIDOS } from "./relatorio.service.js";

export function listarTemplates(user) {
  // admin vê todos, outros veem os próprios + os compartilhados
  const rows = db.prepare(`
    SELECT t.*, u.username as autor_username, u.nome as autor_nome
    FROM relatorio_templates t
    JOIN users u ON u.id = t.user_id
    WHERE t.user_id = ? OR t.compartilhar = 1
    ORDER BY t.nome
  `).all(user.id);
  return rows.map(deserialize);
}

export function obterTemplate(id, user) {
  const row = db.prepare(`
    SELECT t.*, u.username as autor_username
    FROM relatorio_templates t
    JOIN users u ON u.id = t.user_id
    WHERE t.id = ?
  `).get(id);
  if (!row) return null;
  // Só o dono ou template compartilhado
  if (row.user_id !== user.id && !row.compartilhar && user.role !== "admin") {
    return null;
  }
  return deserialize(row);
}

export function criarTemplate(user, body) {
  const { nome, descricao, campos, filtros, incluir_itens, compartilhar } = body || {};
  if (!nome || typeof nome !== "string") throw new Error("Nome é obrigatório");
  if (!Array.isArray(campos) || !campos.length) {
    throw new Error("Selecione ao menos uma coluna");
  }
  const camposValidos = campos.filter((c) => CAMPOS_PERMITIDOS.includes(c));
  if (!camposValidos.length) throw new Error("Nenhuma coluna válida selecionada");

  const info = db.prepare(`
    INSERT INTO relatorio_templates (user_id, nome, descricao, campos, filtros, incluir_itens, compartilhar)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    String(nome).trim().slice(0, 80),
    (descricao || null) ? String(descricao).trim().slice(0, 250) : null,
    JSON.stringify(camposValidos),
    filtros ? JSON.stringify(filtros) : null,
    incluir_itens ? 1 : 0,
    compartilhar ? 1 : 0
  );
  return obterTemplate(Number(info.lastInsertRowid), user);
}

export function atualizarTemplate(id, user, { nome, descricao, campos, filtros, incluir_itens, compartilhar }) {
  const existente = db.prepare("SELECT * FROM relatorio_templates WHERE id = ?").get(id);
  if (!existente) throw new Error("Template não encontrado");
  if (existente.user_id !== user.id && user.role !== "admin") {
    throw new Error("Sem permissão para editar este template");
  }
  const camposValidos = Array.isArray(campos) ? campos.filter((c) => CAMPOS_PERMITIDOS.includes(c)) : JSON.parse(existente.campos);
  db.prepare(`
    UPDATE relatorio_templates
    SET nome = COALESCE(?, nome),
        descricao = COALESCE(?, descricao),
        campos = ?,
        filtros = COALESCE(?, filtros),
        incluir_itens = COALESCE(?, incluir_itens),
        compartilhar = COALESCE(?, compartilhar),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nome != null ? String(nome).trim().slice(0, 80) : null,
    descricao != null ? String(descricao).trim().slice(0, 250) : null,
    JSON.stringify(camposValidos),
    filtros ? JSON.stringify(filtros) : null,
    incluir_itens == null ? null : (incluir_itens ? 1 : 0),
    compartilhar == null ? null : (compartilhar ? 1 : 0),
    id
  );
  return obterTemplate(id, user);
}

export function removerTemplate(id, user) {
  const existente = db.prepare("SELECT * FROM relatorio_templates WHERE id = ?").get(id);
  if (!existente) throw new Error("Template não encontrado");
  if (existente.user_id !== user.id && user.role !== "admin") {
    throw new Error("Sem permissão para remover este template");
  }
  db.prepare("DELETE FROM relatorio_templates WHERE id = ?").run(id);
  return { ok: true };
}

function deserialize(row) {
  let campos = [], filtros = null;
  try { campos = JSON.parse(row.campos || "[]"); } catch (e) {}
  try { filtros = row.filtros ? JSON.parse(row.filtros) : null; } catch (e) {}
  return {
    id: row.id,
    user_id: row.user_id,
    nome: row.nome,
    descricao: row.descricao,
    campos,
    filtros,
    incluir_itens: !!row.incluir_itens,
    compartilhar: !!row.compartilhar,
    autor_username: row.autor_username,
    autor_nome: row.autor_nome,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
