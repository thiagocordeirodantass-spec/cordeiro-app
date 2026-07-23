// =============================================================================
//  routes/auth.routes.js — login, logout, me, change-password, register
// =============================================================================
import { Router } from "express";
import { db } from "../db/index.js";
import {
  verifyPassword, createSession, deleteSession,
  setSessionCookie, clearSessionCookie, hashPassword,
} from "../services/auth.service.js";
import { sendVerificationCode, loadMailConfig, maskMailConfig, saveMailConfig, getTransporter } from "../services/mailer.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const AVATARS_DIR = path.join(DATA_DIR, "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const router = Router();
const uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Middleware local: exige login E role=admin
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Acesso restrito a administradores" });
  next();
}

// =============================================================================
//  LOGIN
// =============================================================================
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios" });

  const user = db.prepare("SELECT * FROM users WHERE username = ? AND ativo = 1").get(String(username).trim());
  if (!user) return res.status(401).json({ error: "Usuário ou senha inválidos" });

  const ok = verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Usuário ou senha inválidos" });

  const { id, expiresAt } = createSession({
    userId: user.id, ip: req.ip, userAgent: req.headers["user-agent"] || null,
  });
  setSessionCookie(res, id);
  db.prepare("UPDATE users SET ultimo_login = datetime('now') WHERE id = ?").run(user.id);

  res.json({
    ok: true,
    user: userPublic(user),
    expiresAt,
  });
});

router.post("/logout", (req, res) => {
  if (req.sessionToken) deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  // Recarrega do banco para refletir avatar/dados atualizados (req.user é cache da sessão)
  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ user: userPublic(fresh || req.user) });
});

router.post("/change-password", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  const { senhaAtual, novaSenha } = req.body || {};
  if (!novaSenha || novaSenha.length < 4) return res.status(400).json({ error: "Nova senha deve ter ao menos 4 caracteres" });

  const row = db.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").get(req.user.id);
  if (senhaAtual) {
    if (!verifyPassword(senhaAtual, row.password_salt, row.password_hash)) {
      return res.status(400).json({ error: "Senha atual incorreta" });
    }
  }
  const { hash, salt } = hashPassword(novaSenha);
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, primeiro_login = 0, updated_at = datetime('now') WHERE id = ?")
    .run(hash, salt, req.user.id);
  res.json({ ok: true });
});

// =============================================================================
//  CADASTRO COM VERIFICAÇÃO DE EMAIL
// =============================================================================

// 1) Recebe dados + foto, gera código de 6 dígitos, envia por email
router.post("/register-start", uploadAvatar.single("avatar"), async (req, res) => {
  const { nome, email, username, password } = req.body || {};
  if (!nome || !email || !username || !password) {
    return res.status(400).json({ error: "Nome, email, usuário e senha são obrigatórios" });
  }
  if (password.length < 4) return res.status(400).json({ error: "Senha deve ter ao menos 4 caracteres" });
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: "Usuário inválido (3-30 caracteres, letras/números/._-)" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email inválido" });
  }

  // Verifica se já existe
  const exists = db.prepare("SELECT id FROM users WHERE username = ? OR email = ?").get(username, email);
  if (exists) return res.status(400).json({ error: "Já existe um usuário com esse username ou email" });

  // Gera código 6 dígitos
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const { hash, salt } = hashPassword(password);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Salva foto se enviada
  let avatarPath = null;
  if (req.file) {
    const ext = (req.file.originalname || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(AVATARS_DIR, fname), req.file.buffer);
    avatarPath = `avatars/${fname}`;
  }

  // Limpa códigos antigos do mesmo email
  db.prepare("DELETE FROM email_verifications WHERE email = ?").run(email);

  // Insere verificação pendente
  db.prepare(`INSERT INTO email_verifications
    (email, username, nome, password_hash, password_salt, codigo, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(email, username, nome, hash, salt, codigo, expiresAt);

  // Envia email
  const mailResult = await sendVerificationCode({
    to: email, codigo, nomeUsuario: nome, dataDir: DATA_DIR, expiresMin: 15,
  });

  res.json({
    ok: true,
    expiresAt,
    avatarPath,    // guardado para usar na criação
    mailMethod: mailResult.method,
    codigoDev: mailResult.devCode || null,   // presente quando SMTP falhou (modo console)
  });
});

// 2) Valida código e cria usuário
router.post("/register-verify", (req, res) => {
  const { email, codigo } = req.body || {};
  if (!email || !codigo) return res.status(400).json({ error: "Email e código são obrigatórios" });

  const row = db.prepare("SELECT * FROM email_verifications WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
  if (!row) return res.status(400).json({ error: "Nenhuma verificação pendente para este email" });

  // Expirado
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM email_verifications WHERE id = ?").run(row.id);
    return res.status(400).json({ error: "Código expirado — solicite um novo" });
  }
  // Limite de tentativas
  if (row.tentativas >= 5) {
    db.prepare("DELETE FROM email_verifications WHERE id = ?").run(row.id);
    return res.status(429).json({ error: "Muitas tentativas — solicite um novo código" });
  }
  // Código errado
  if (row.codigo !== String(codigo).trim()) {
    db.prepare("UPDATE email_verifications SET tentativas = tentativas + 1 WHERE id = ?").run(row.id);
    return res.status(400).json({ error: "Código incorreto" });
  }

  // Cria usuário
  const role = db.prepare("SELECT COUNT(*) as c FROM users").get().c === 0 ? "admin" : "operador";
  const info = db.prepare(`INSERT INTO users
    (username, nome, email, password_hash, password_salt, role, ativo, primeiro_login)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0)`)
    .run(row.username, row.nome, row.email, row.password_hash, row.password_salt, role);

  db.prepare("DELETE FROM email_verifications WHERE id = ?").run(row.id);

  // Cria sessão
  const { id, expiresAt } = createSession({
    userId: Number(info.lastInsertRowid), ip: req.ip, userAgent: req.headers["user-agent"] || null,
  });
  setSessionCookie(res, id);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid));
  res.json({ ok: true, user: userPublic(user), expiresAt, role });
});

// 3) Reenvia código
router.post("/resend-code", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email obrigatório" });
  const row = db.prepare("SELECT * FROM email_verifications WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
  if (!row) return res.status(400).json({ error: "Nenhuma verificação pendente" });

  // Rate limit: 30s entre reenvios
  if (row.created_at) {
    const elapsed = (Date.now() - new Date(row.created_at + "Z").getTime()) / 1000;
    if (elapsed < 30) {
      return res.status(429).json({ error: `Aguarde ${Math.ceil(30 - elapsed)}s antes de reenviar` });
    }
  }
  const novoCodigo = String(Math.floor(100000 + Math.random() * 900000));
  const novoExpira = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare("UPDATE email_verifications SET codigo = ?, expires_at = ?, tentativas = 0 WHERE id = ?")
    .run(novoCodigo, novoExpira, row.id);

  const mailResult = await sendVerificationCode({
    to: email, codigo: novoCodigo, nomeUsuario: row.nome, dataDir: DATA_DIR, expiresMin: 15,
  });
  res.json({ ok: true, expiresAt: novoExpira, mailMethod: mailResult.method, codigoDev: mailResult.devCode || null });
});

// =============================================================================
//  PERFIL (foto, nome, email)
// =============================================================================
router.post("/me/avatar", uploadAvatar.single("avatar"), (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  if (!req.file) return res.status(400).json({ error: "Nenhuma foto enviada" });
  const ext = (req.file.originalname || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const fname = `u${req.user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(AVATARS_DIR, fname), req.file.buffer);
  // remove avatar antigo (se for do mesmo user)
  const old = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(req.user.id);
  if (old && old.avatar_path) {
    try { fs.unlinkSync(path.join(DATA_DIR, old.avatar_path)); } catch (e) {}
  }
  db.prepare("UPDATE users SET avatar_path = ? WHERE id = ?").run(`avatars/${fname}`, req.user.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ ok: true, user: userPublic(user) });
});

router.put("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  const { nome, email } = req.body || {};
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email inválido" });
  }
  db.prepare("UPDATE users SET nome = ?, email = ?, updated_at = datetime('now') WHERE id = ?")
    .run(nome, email || null, req.user.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({ ok: true, user: userPublic(user) });
});

router.delete("/me/avatar", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Não autenticado" });
  const old = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(req.user.id);
  if (old && old.avatar_path) {
    try { fs.unlinkSync(path.join(DATA_DIR, old.avatar_path)); } catch (e) {}
  }
  db.prepare("UPDATE users SET avatar_path = NULL WHERE id = ?").run(req.user.id);
  res.json({ ok: true });
});

// =============================================================================
//  CONFIG DE EMAIL (admin)
// =============================================================================
router.get("/mail/config", requireAdmin, (_req, res) => res.json(maskMailConfig(loadMailConfig(DATA_DIR))));
router.post("/mail/config", requireAdmin, (req, res) => {
  const { host, port, user, pass, from, secure } = req.body || {};
  const partial = {};
  if (host !== undefined) partial.host = String(host || "").trim();
  if (port !== undefined) partial.port = Number(port || 587);
  if (user !== undefined) partial.user = String(user || "").trim();
  if (pass !== undefined) partial.pass = String(pass || "");
  if (from !== undefined) partial.from = String(from || "").trim();
  if (secure !== undefined) partial.secure = Boolean(secure);
  res.json(saveMailConfig(DATA_DIR, partial));
});

// Endpoint de teste — envia um email de teste para validar a config SMTP
router.post("/mail/test", requireAdmin, async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: "Informe o email de destino" });
  const transporter = getTransporter(DATA_DIR);
  if (!transporter) return res.status(400).json({ error: "SMTP não configurado — preencha host, user e pass primeiro" });
  const cfg = loadMailConfig(DATA_DIR);
  try {
    const info = await transporter.sendMail({
      from: cfg.from || cfg.user,
      to,
      subject: "🐑 Cordeiro Sistema — Email de teste",
      text: "Olá! Este é um email de teste do Cordeiro Sistema. Se você recebeu, o SMTP está funcionando.",
      html: `<div style="font-family:Arial;padding:20px"><h2 style="color:#0e7c66">🐑 Cordeiro Sistema</h2><p>Este é um <b>email de teste</b> do Cordeiro Sistema.</p><p>Se você recebeu, o SMTP está <b style="color:green">funcionando perfeitamente</b>!</p><hr><small>Enviado de ${cfg.user} para ${to}</small></div>`,
    });
    res.json({ ok: true, messageId: info.messageId, method: "smtp" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =============================================================================
//  HELPER
// =============================================================================
function userPublic(u) {
  return {
    id: u.id,
    username: u.username,
    nome: u.nome,
    email: u.email,
    role: u.role,
    avatar_path: u.avatar_path,
    avatar_url: u.avatar_path ? `/api/${u.avatar_path}` : null,
    primeiro_login: !!u.primeiro_login,
    ultimo_login: u.ultimo_login,
  };
}

export default router;
