// =============================================================================
//  routes/feedback.routes.js — Chat de feedback dos usuários para os devs
//  -----------------------------------------------------------------------------
//  Usuários autenticados podem enviar feedbacks (categoria, assunto, mensagem).
//  Admins visualizam todos os feedbacks, podem mudar status e responder.
// =============================================================================
import { Router } from "express";
import { db } from "../db/index.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

// Handlers admin (listar todos, responder, mudar status, excluir)
const adminOnly = requireRole("admin");

// POST /api/feedback — envia um novo feedback
// (qualquer usuário autenticado)
router.post("/", (req, res) => {
  const { categoria, assunto, mensagem, anonimo } = req.body || {};
  if (!mensagem || !String(mensagem).trim()) {
    return res.status(400).json({ error: "Mensagem é obrigatória" });
  }
  const cat = String(categoria || "outro");
  if (!["bug", "melhoria", "implementacao", "duvida", "outro"].includes(cat)) {
    return res.status(400).json({ error: "Categoria inválida" });
  }
  const info = db.prepare(`
    INSERT INTO feedback (user_id, username, categoria, assunto, mensagem, anonimo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    req.user.username,
    cat,
    (assunto || "").toString().trim().slice(0, 120) || null,
    String(mensagem).trim().slice(0, 4000),
    anonimo ? 1 : 0
  );
  const row = db.prepare("SELECT * FROM feedback WHERE id = ?").get(info.lastInsertRowid);
  res.json({ ok: true, feedback: sanitize(row) });
});

// GET /api/feedback/me — lista os meus feedbacks (com respostas)
// (qualquer usuário autenticado)
router.get("/me", (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM feedback
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(req.user.id);
  res.json(rows.map(sanitize));
});

// GET /api/feedback — lista TODOS os feedbacks (apenas admin)
// Suporta ?status=aberto e ?categoria=bug para filtros
router.get("/", adminOnly, (req, res) => {
  const { status, categoria } = req.query || {};
  const where = [];
  const params = [];
  if (status) { where.push("status = ?"); params.push(status); }
  if (categoria) { where.push("categoria = ?"); params.push(categoria); }
  const sql = `
    SELECT * FROM feedback
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC
    LIMIT 500
  `;
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(sanitize));
});

// PATCH /api/feedback/:id — admin muda status e/ou responde
router.patch("/:id", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM feedback WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Feedback não encontrado" });

  const { status, resposta } = req.body || {};
  if (status && !["aberto", "em_analise", "resolvido", "rejeitado"].includes(status)) {
    return res.status(400).json({ error: "status inválido" });
  }

  // node:sqlite não tem db.transaction(fn) — usar BEGIN/COMMIT/ROLLBACK manual
  try {
    db.exec("BEGIN");
    if (status) {
      db.prepare("UPDATE feedback SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(status, id);
    }
    if (resposta != null && String(resposta).trim()) {
      db.prepare(`
        UPDATE feedback
        SET resposta = ?, respondido_por = ?, respondido_em = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(String(resposta).trim().slice(0, 4000), req.user.username, id);
      // Responder automaticamente marca como resolvido (a menos que o admin tenha escolhido outro)
      if (!status) {
        db.prepare("UPDATE feedback SET status = 'resolvido', updated_at = datetime('now') WHERE id = ?").run(id);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (e) {}
    return res.status(500).json({ error: err.message });
  }
  res.json({ ok: true, feedback: sanitize(db.prepare("SELECT * FROM feedback WHERE id = ?").get(id)) });
});

// DELETE /api/feedback/:id — admin remove
router.delete("/:id", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT id FROM feedback WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Feedback não encontrado" });
  db.prepare("DELETE FROM feedback WHERE id = ?").run(id);
  res.json({ ok: true });
});

// GET /api/feedback/stats — contadores para badges no menu (admin e usuário)
router.get("/stats", (req, res) => {
  const meus = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('aberto','em_analise') THEN 1 ELSE 0 END) as pendentes,
      SUM(CASE WHEN status = 'resolvido' THEN 1 ELSE 0 END) as resolvidos
    FROM feedback WHERE user_id = ?
  `).get(req.user.id);
  res.json({
    meusPendentes: Number(meus?.pendentes || 0),
    meusResolvidos: Number(meus?.resolvidos || 0),
  });
});

function sanitize(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.anonimo ? "Anônimo" : row.username,
    categoria: row.categoria,
    assunto: row.assunto,
    mensagem: row.mensagem,
    anonimo: !!row.anonimo,
    status: row.status,
    resposta: row.resposta,
    respondidoPor: row.respondido_por,
    respondidoEm: row.respondido_em,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
