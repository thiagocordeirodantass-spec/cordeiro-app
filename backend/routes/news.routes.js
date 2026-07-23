// =============================================================================
//  routes/news.routes.js — Endpoint de notícias fiscais
// =============================================================================
import { Router } from "express";
import { getNews } from "../services/news.service.js";

const router = Router();

let cache = null;
let cacheAt = 0;
const CACHE_MS = 10 * 60 * 1000; // 10 minutos

router.get("/", async (_req, res) => {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_MS) {
    try {
      cache = await getNews();
      cacheAt = now;
    } catch (e) {
      // Em último caso, devolve só as curadas
      cache = { curadas: (await getNews()).curadas, externos: [], erros: [{ erro: e.message }] };
      cacheAt = now;
    }
  }
  res.json(cache);
});

export default router;
