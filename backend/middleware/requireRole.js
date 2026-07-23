// =============================================================================
//  middleware/requireRole.js — gate por perfil
//  -----------------------------------------------------------------------------
//  Uso:  router.get('/users', requireRole('admin'), handler)
//        router.post('/docs', requireRole('admin', 'operador'), handler)
// =============================================================================
export function requireRole(...roles) {
  const allowed = new Set(roles);
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Não autenticado" });
    if (!allowed.has(req.user.role)) {
      return res.status(403).json({ error: "Acesso negado para o perfil atual" });
    }
    next();
  };
}
