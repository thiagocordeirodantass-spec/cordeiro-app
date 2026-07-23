// =============================================================================
//  services/auth.service.js
//  -----------------------------------------------------------------------------
//  - Hash de senha com scrypt (Node crypto nativo, sem dependência externa)
//  - Criação e validação de sessões (token opaco armazenado no SQLite)
// =============================================================================
import crypto from "crypto";
import { db } from "../db/index.js";

const SESSION_TTL_HOURS = 8;
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

// ---- Hash de senha (scrypt) ----
export function hashPassword(plain, saltHex = null) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return {
    salt: salt.toString("hex"),
    hash: hash.toString("hex"),
  };
}

export function verifyPassword(plain, saltHex, hashHex) {
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(plain, salt, expected.length, { N: 16384, r: 8, p: 1 });
  // comparação constant-time
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// ---- Sessões ----
function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function createSession({ userId, ip, userAgent }) {
  const id = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, expiresAt, ip || null, userAgent || null);
  return { id, expiresAt };
}

export function findSession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.id as sid, s.expires_at, s.ip, s.user_agent,
           u.id as user_id, u.username, u.nome, u.email, u.role, u.ativo, u.primeiro_login
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND u.ativo = 1
  `).get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return {
    token: row.sid,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      nome: row.nome,
      email: row.email,
      role: row.role,
      primeiro_login: !!row.primeiro_login,
    },
  };
}

export function deleteSession(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// ---- Cookie helpers ----
export const COOKIE_NAME = "sid";
export function setSessionCookie(res, token) {
  // 8h, httpOnly, sameSite=Lax (proteção CSRF razoável p/ app local)
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_HOURS * 3600}`);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
