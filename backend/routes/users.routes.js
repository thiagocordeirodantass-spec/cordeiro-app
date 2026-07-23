// =============================================================================
//  routes/users.routes.js — CRUD de usuários (somente admin)
// =============================================================================
import { Router } from "express";
import crypto from "crypto";
import { db } from "../db/index.js";
import { requireRole } from "../middleware/requireRole.js";
import { hashPassword } from "../services/auth.service.js";

const router = Router();
router.use(requireRole("admin"));

function sanitize(row) {
  if (!row) return null;
  const { password_hash, password_salt, ...rest } = row;
  return rest;
}

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY username").all();
  res.json(rows.map(sanitize));
});

router.post("/", (req, res) => {
  const { username, nome, email, role, ativo } = req.body || {};
  if (!username || !nome || !role) return res.status(400).json({ error: "username, nome e role são obrigatórios" });
  if (!["admin", "operador", "visualizador"].includes(role)) return res.status(400).json({ error: "role inválido" });
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    return res.status(400).json({ error: "Já existe um usuário com esse username" });
  }
  const tempPassword = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x").slice(0, 12);
  const { hash, salt } = hashPassword(tempPassword);
  const info = db.prepare(`
    INSERT INTO users (username, nome, email, password_hash, password_salt, role, ativo, primeiro_login)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(String(username).trim(), String(nome).trim(), email || null, hash, salt, role, ativo === false ? 0 : 1);

  const created = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid));
  res.json({ user: sanitize(created), senhaTemporaria: tempPassword });
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Usuário não encontrado" });
  const { nome, email, role, ativo } = req.body || {};
  if (role && !["admin", "operador", "visualizador"].includes(role)) {
    return res.status(400).json({ error: "role inválido" });
  }
  db.prepare(`
    UPDATE users
    SET nome = COALESCE(?, nome),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        ativo = COALESCE(?, ativo),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nome != null ? String(nome).trim() : null,
    email != null ? String(email).trim() : null,
    role || null,
    ativo == null ? null : (ativo ? 1 : 0),
    id
  );
  res.json({ user: sanitize(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
});

router.post("/:id/reset-password", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Usuário não encontrado" });
  const tempPassword = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x").slice(0, 12);
  const { hash, salt } = hashPassword(tempPassword);
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, primeiro_login = 1, updated_at = datetime('now') WHERE id = ?")
    .run(hash, salt, id);
  res.json({ ok: true, senhaTemporaria: tempPassword });
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Você não pode excluir o próprio usuário" });
  const row = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Usuário não encontrado" });

  // Bloqueia exclusão do último admin
  if (row.role === "admin") {
    const outrosAdmins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND id != ? AND ativo = 1").get(id).c;
    if (outrosAdmins === 0) {
      return res.status(400).json({ error: "Não é possível excluir o último administrador ativo" });
    }
  }

  // Apaga sessões, templates e referências; depois remove o usuário
  // (node:sqlite não tem db.transaction(fn) — usar BEGIN/COMMIT/ROLLBACK manual)
  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM email_verifications WHERE username = (SELECT username FROM users WHERE id = ?)").run(id);
    // Mantém templates e histórico, mas desvincula (denormalização via username)
    db.prepare("UPDATE relatorio_templates SET user_id = NULL WHERE user_id = ?").run(id);
    // user_id em relatorio_historico tem ON DELETE SET NULL — fica
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (e) {}
    throw err;
  }

  res.json({ ok: true, excluido: row.username });
});

export default router;
