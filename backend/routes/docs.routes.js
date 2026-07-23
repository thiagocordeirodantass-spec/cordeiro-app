// =============================================================================
//  routes/docs.routes.js — CRUD de documentos (NF-e, CT-e, NFC-e)
//  -----------------------------------------------------------------------------
//  Mantém o mesmo contrato dos endpoints originais do projeto.
//  Permissões:
//    - leitura:  qualquer usuário autenticado
//    - escrita (import/upload/delete): somente admin ou operador
// =============================================================================
import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { db } from "../db/index.js";
import { XML_DIR_PATH, parseXml, saveDocument, getXmlPathByRow } from "../services/documents.service.js";
import { requireRole } from "../middleware/requireRole.js";
import * as meudanfe from "../services/meudanfe.js";
import { fileURLToPath } from "url";
import pathMod from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathMod.dirname(__filename);
const DATA_DIR = pathMod.resolve(__dirname, "..", "..", "data");

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---- Healthcheck
router.get("/_health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- Estatísticas
router.get("/_stats", (_req, res) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM documents").get().c;
  const nfe = db.prepare("SELECT COUNT(*) as c FROM documents WHERE kind = 'NFE'").get().c;
  const cte = db.prepare("SELECT COUNT(*) as c FROM documents WHERE kind = 'CTE'").get().c;
  const canc = db.prepare("SELECT COUNT(*) as c FROM documents WHERE status = 'cancelado'").get().c;
  const valorTotal = db.prepare("SELECT COALESCE(SUM(CAST(valor_total AS REAL)), 0) as v FROM documents").get().v;
  res.json({ total, nfe, cte, cancelados: canc, valorTotal });
});

// ---- Listagem com filtros
router.get("/", (req, res) => {
  const { kind, status, q, uf, dateFrom, dateTo, papel, meuCnpj, source, limit = 200, offset = 0 } = req.query;
  const where = [];
  const params = [];
  if (kind) { where.push("kind = ?"); params.push(String(kind).toUpperCase()); }
  if (status) { where.push("status = ?"); params.push(status); }
  if (source) { where.push("source = ?"); params.push(String(source)); }
  if (uf) { where.push("(uf_emitente = ? OR uf_destino = ?)"); params.push(uf, uf); }
  if (dateFrom) { where.push("date(data_emissao) >= date(?)"); params.push(dateFrom); }
  if (dateTo) { where.push("date(data_emissao) <= date(?)"); params.push(dateTo); }
  if (q) {
    where.push("(remetente_nome LIKE ? OR destinatario_nome LIKE ? OR chave LIKE ? OR numero LIKE ? OR remetente_doc LIKE ? OR destinatario_doc LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (papel && meuCnpj) {
    const cnpjDigits = String(meuCnpj).replace(/\D/g, "");
    if (papel === "emitidas") {
      where.push("REPLACE(REPLACE(remetente_doc,'.',''),'-','') LIKE ?");
      params.push(`%${cnpjDigits}%`);
    } else if (papel === "recebidas") {
      where.push("REPLACE(REPLACE(destinatario_doc,'.',''),'-','') LIKE ?");
      params.push(`%${cnpjDigits}%`);
    }
  }
  const sql = `
    SELECT id, kind, modelo, chave, numero, serie, data_emissao,
           uf_emitente, uf_destino, remetente_nome, remetente_doc,
           destinatario_nome, destinatario_doc, valor_total, status, protocolo,
           source, created_at, updated_at
    FROM documents
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY datetime(data_emissao) DESC, id DESC
    LIMIT ? OFFSET ?
  `;
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(sql).all(...params));
});

// ---- Detalhe
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM documents WHERE id = ? OR chave = ?").get(id, String(req.params.id));
  if (!row) return res.status(404).json({ error: "Nao encontrado" });
  let xml = null;
  try { xml = fs.readFileSync(getXmlPathByRow(row), "utf-8"); } catch (e) { xml = null; }
  res.json({ ...row, xml });
});

// ---- Download XML
router.get("/:id/xml", (req, res) => {
  const row = db.prepare("SELECT xml_path, chave FROM documents WHERE id = ? OR chave = ?")
    .get(Number(req.params.id) || 0, String(req.params.id));
  if (!row) return res.status(404).json({ error: "Nao encontrado" });
  const filePath = getXmlPathByRow(row);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Arquivo nao encontrado" });
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${row.chave || "documento"}.xml"`);
  fs.createReadStream(filePath).pipe(res);
});

// ---- Baixar DANFE PDF (oficial, via MeuDANFe) — por id OU chave
router.get("/:id/pdf", async (req, res) => {
  const row = db.prepare("SELECT * FROM documents WHERE id = ? OR chave = ?")
    .get(Number(req.params.id) || 0, String(req.params.id));
  if (!row) return res.status(404).json({ error: "Documento nao encontrado" });
  let xmlText;
  try { xmlText = fs.readFileSync(getXmlPathByRow(row), "utf-8"); } catch (e) {
    return res.status(404).json({ error: "Arquivo XML nao encontrado no disco" });
  }
  try {
    const cfg = meudanfe.loadConfig(DATA_DIR);
    const pdf = await meudanfe.xmlParaDanfePdf(cfg, xmlText);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `attachment; filename="danfe-${row.kind}-${row.numero || row.chave || row.id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    res.status(502).json({ error: "Falha ao gerar DANFE via MeuDANFe: " + e.message });
  }
});

// ---- Buscar por número
router.get("/numero/:numero", (req, res) => {
  const { numero } = req.params;
  const { kind } = req.query;
  const where = ["numero = ?"];
  const params = [String(numero)];
  if (kind) { where.push("kind = ?"); params.push(String(kind).toUpperCase()); }
  res.json(db.prepare(
    `SELECT id, kind, modelo, chave, numero, serie, data_emissao,
            remetente_nome, destinatario_nome, valor_total, status
     FROM documents WHERE ${where.join(" AND ")}
     ORDER BY datetime(data_emissao) DESC`).all(...params));
});

// ---- Importar via JSON
router.post("/import", requireRole("admin", "operador"), (req, res) => {
  const { xml, kind, source, fileName } = req.body || {};
  if (!xml) return res.status(400).json({ error: "xml nao fornecido" });
  const result = saveDocument({ xmlText: xml, kind, source: source || "paste", fileName });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// ---- Importar via upload (vários arquivos)
router.post("/upload", requireRole("admin", "operador"), upload.array("files", 50), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "Nenhum arquivo enviado" });
  const results = files.map((f) => {
    const xmlText = f.buffer.toString("utf-8");
    return { fileName: f.originalname, ...saveDocument({ xmlText, source: "upload", fileName: f.originalname }) };
  });
  res.json({ processed: results });
});

// ---- Remover
router.delete("/:id", requireRole("admin", "operador"), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT xml_path FROM documents WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Nao encontrado" });
  try { fs.unlinkSync(path.join(XML_DIR_PATH, row.xml_path)); } catch (e) {}
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  res.json({ ok: true });
});

export default router;
