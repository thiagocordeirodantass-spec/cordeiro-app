// =============================================================================
//  routes/meudanfe.routes.js — integração com a API MeuDANFe
// =============================================================================
import { Router } from "express";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import * as meudanfe from "../services/meudanfe.js";
import { requireRole } from "../middleware/requireRole.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/config", (_req, res) => res.json(meudanfe.maskConfig(meudanfe.loadConfig(DATA_DIR))));
router.post("/config", (req, res) => {
  const { apiKey, xmlToPdfUrl, customChaveUrl, customChaveMethod, customHeaders, timeoutMs } = req.body || {};
  const partial = {};
  if (apiKey !== undefined) partial.apiKey = String(apiKey || "").trim();
  if (xmlToPdfUrl !== undefined) partial.xmlToPdfUrl = String(xmlToPdfUrl || "").trim();
  if (customChaveUrl !== undefined) partial.customChaveUrl = String(customChaveUrl || "").trim();
  if (customChaveMethod) partial.customChaveMethod = String(customChaveMethod).trim().toUpperCase();
  if (customHeaders !== undefined) partial.customHeaders = String(customHeaders || "").trim();
  if (timeoutMs) partial.timeoutMs = Number(timeoutMs);
  res.json(meudanfe.maskConfig(meudanfe.saveConfig(DATA_DIR, partial)));
});

router.use(requireRole("admin", "operador"));

router.post("/xml-para-pdf", async (req, res) => {
  const { xml } = req.body || {};
  if (!xml || typeof xml !== "string") return res.status(400).json({ error: "xml nao fornecido" });
  try {
    const cfg = meudanfe.loadConfig(DATA_DIR);
    const pdf = await meudanfe.xmlParaDanfePdf(cfg, xml);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="danfe-meudanfe.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.post("/upload-para-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
  try {
    const cfg = meudanfe.loadConfig(DATA_DIR);
    const pdf = await meudanfe.xmlParaDanfePdf(cfg, req.file.buffer.toString("utf-8"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="danfe-meudanfe.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get("/chave/:chave/xml", async (req, res) => {
  const chave = req.params.chave.replace(/\D/g, "");
  if (chave.length !== 44) return res.status(400).json({ error: "Chave deve ter 44 digitos" });
  try {
    const cfg = meudanfe.loadConfig(DATA_DIR);
    const xml = await meudanfe.chaveParaXml(cfg, chave);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${chave}.xml"`);
    res.send(xml);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

router.get("/chave/:chave/pdf", async (req, res) => {
  const chave = req.params.chave.replace(/\D/g, "");
  if (chave.length !== 44) return res.status(400).json({ error: "Chave deve ter 44 digitos" });
  try {
    const cfg = meudanfe.loadConfig(DATA_DIR);
    const xml = await meudanfe.chaveParaXml(cfg, chave);
    const pdf = await meudanfe.xmlParaDanfePdf(cfg, xml);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="danfe-${chave}.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Resumo estruturado da NF-e (parser do XML retornado pelo MeuDANFe)
router.get("/chave/:chave/resumo", async (req, res) => {
  const chave = req.params.chave.replace(/\D/g, "");
  if (chave.length !== 44) return res.status(400).json({ error: "Chave deve ter 44 digitos" });
  try {
    const cfg = meudanfe.loadConfig(DATA_DIR);
    const xml = await meudanfe.chaveParaXml(cfg, chave);
    const resumo = parseXmlParaResumo(xml, chave);
    res.json({ ok: true, chave, ...resumo });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Parser leve de NF-e (NFe 4.00) e CT-e (modelo 57) para extrair dados principais
function parseXmlParaResumo(xmlText, chave) {
  const out = {
    tipo: chave.slice(20, 22) === "57" ? "CT-e" : "NF-e",
    numero: null, serie: null, dataEmissao: null,
    emitenteNome: null, emitenteCnpj: null,
    destinatarioNome: null, destinatarioCnpj: null,
    valorTotal: null, status: "autorizado", protocolo: null,
  };
  if (!xmlText || typeof xmlText !== "string") return out;
  const get = (re) => { const m = xmlText.match(re); return m ? m[1] : null; };
  out.numero = get(/<(?:nNF|nCT)>([^<]+)<\//);
  out.serie = get(/<serie>([^<]+)<\//);
  out.dataEmissao = get(/<dhEmi>([^<]+)<\//) || get(/<dEmi>([^<]+)<\//);
  const emitMatch = xmlText.match(/<(?:emit|rem)>([\s\S]*?)<\/(?:emit|rem)>/);
  if (emitMatch) {
    out.emitenteNome = (emitMatch[1].match(/<xNome>([^<]+)<\//) || [])[1] || null;
    out.emitenteCnpj = (emitMatch[1].match(/<CNPJ>([^<]+)<\//) || [])[1] || null;
  }
  const destMatch = xmlText.match(/<(?:dest|toma|destinatario)>([\s\S]*?)<\/(?:dest|toma|destinatario)>/);
  if (destMatch) {
    out.destinatarioNome = (destMatch[1].match(/<xNome>([^<]+)<\//) || [])[1] || null;
    out.destinatarioCnpj = (destMatch[1].match(/<CNPJ>([^<]+)<\//) || [])[1] || null;
  }
  out.valorTotal = Number(get(/<vNF>([^<]+)<\//) || get(/<vTPrest>([^<]+)<\//) || get(/<vRec>([^<]+)<\//) || 0) || null;
  out.protocolo = get(/<nProt>([^<]+)<\//);
  const cStat = get(/<cStat>([^<]+)<\//);
  if (cStat === "101" || cStat === "100") out.status = "autorizado";
  else if (cStat === "135" || cStat === "155") out.status = "cancelado";
  else if (cStat === "110" || cStat === "301") out.status = "denegado";
  return out;
}

export default router;
