// =============================================================================
//  routes/generate.routes.js — geração de XML de NF-e e CT-e a partir de JSON
// =============================================================================
import { Router } from "express";
import { generateNFe, generateCTe } from "../services/documents.service.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(requireRole("admin", "operador"));

router.post("/nfe", (req, res) => {
  try { res.json(generateNFe(req.body || {})); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post("/cte", (req, res) => {
  try { res.json(generateCTe(req.body || {})); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

export default router;
