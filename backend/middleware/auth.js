// =============================================================================
//  middleware/auth.js
//  -----------------------------------------------------------------------------
//  - Lê o cookie de sessão
//  - Anexa req.user se autenticado
//  - Para rotas protegidas, retorna 401 se não autenticado
//  - Lista branca de rotas públicas: /api/auth/login, /api/health, raiz e assets
// =============================================================================
import { COOKIE_NAME, findSession } from "../services/auth.service.js";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register-start",
  "/api/auth/register-verify",
  "/api/auth/resend-code",
  "/api/mail/config",
  "/api/news",
  "/api/health",
]);

// Prefixos públicos: comparados contra req.baseUrl + req.path (que é o caminho
// completo após o Express remover o mount point de app.use).
const PUBLIC_API_PREFIXES = [
  "/api/avatars",
];

function isPublicAsset(path) {
  if (path === "/" || path === "/index.html") return true;
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/pages/")) return true;
  if (path.startsWith("/avatars/")) return true;
  if (path.startsWith("/favicon")) return true;
  if (path.startsWith("/api/auth/login") || path.startsWith("/api/auth/logout")) return true;
  return false;
}

export function readSession(req, _res, next) {
  const token = (req.cookies && req.cookies[COOKIE_NAME]) || parseCookieHeader(req.headers.cookie, COOKIE_NAME);
  const found = findSession(token);
  if (found) {
    req.user = found.user;
    req.sessionToken = found.token;
    req.sessionExpiresAt = found.expiresAt;
  } else {
    req.user = null;
    req.sessionToken = null;
  }
  next();
}

function parseCookieHeader(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = String(cookieHeader).split(";").map((p) => p.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    if (k === name) return p.slice(idx + 1).trim();
  }
  return null;
}

// Aplica autenticação em todas as rotas /api/* exceto as públicas.
// Em Express, req.path é o caminho RELATIVO ao mount point do app.use().
// Ex.: app.use("/api", requireAuth) → req.path vem sem o "/api".
// Por isso checamos tanto o req.originalUrl (URL completa) quanto o req.baseUrl + req.path
// para que as entradas de PUBLIC_API_PATHS funcionem com qualquer montagem.
export function requireAuth(req, res, next) {
  if (req.user) return next();
  const fullPath = (req.baseUrl || "") + req.path;
  const original = (req.originalUrl || "").split("?")[0];
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  if (PUBLIC_API_PATHS.has(fullPath)) return next();
  if (PUBLIC_API_PATHS.has(original)) return next();
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (fullPath === prefix || fullPath.startsWith(prefix + "/")) return next();
    if (original === prefix || original.startsWith(prefix + "/")) return next();
  }
  return res.status(401).json({ error: "Não autenticado" });
}
