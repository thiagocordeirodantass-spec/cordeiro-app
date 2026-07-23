// =============================================================================
//  routes/dashboard.routes.js — agregados para o dashboard
// =============================================================================
import { Router } from "express";
import * as dashboard from "../services/dashboard.service.js";

const router = Router();

router.get("/kpis", (_req, res) => res.json(dashboard.kpis()));
router.get("/por-mes", (req, res) => res.json(dashboard.porMes(req.query.ultimos)));
router.get("/por-uf", (_req, res) => res.json(dashboard.porUf()));
router.get("/top-parceiros", (req, res) => res.json(dashboard.topParceiros({
  papel: req.query.papel || "destinatario",
  limite: req.query.limite || 10,
})));
router.get("/por-status", (_req, res) => res.json(dashboard.porStatus()));

export default router;
