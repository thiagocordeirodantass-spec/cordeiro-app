// =============================================================================
//  routes/pdf.routes.js — geração de PDF de 1 documento a partir de XML solto
// =============================================================================
import { Router } from "express";
import multer from "multer";
import { parseXml, detectKind } from "../services/documents.service.js";
import { buildDocPdfFromXmlText } from "../services/pdf.service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/from-xml", (req, res) => {
  const { xml } = req.body || {};
  if (!xml || typeof xml !== "string") return res.status(400).json({ error: "xml nao fornecido" });
  const parsed = parseXml(xml);
  if (!parsed) return res.status(400).json({ error: "XML invalido" });
  const kind = detectKind(parsed);
  if (kind === "OUTROS") return res.status(400).json({ error: "Documento nao parece ser NF-e ou CT-e" });
  try {
    const pdf = buildDocPdfFromXmlText(xml, kind);
    if (!pdf) return res.status(400).json({ error: "Nao foi possivel gerar o PDF" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${kind}-documento.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: "Falha ao gerar PDF: " + e.message }); }
});

router.post("/from-upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
  const xml = req.file.buffer.toString("utf-8");
  const parsed = parseXml(xml);
  if (!parsed) return res.status(400).json({ error: "XML invalido" });
  const kind = detectKind(parsed);
  if (kind === "OUTROS") return res.status(400).json({ error: "Documento nao parece ser NF-e ou CT-e" });
  try {
    const pdf = buildDocPdfFromXmlText(xml, kind);
    if (!pdf) return res.status(400).json({ error: "Nao foi possivel gerar o PDF" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${kind}-documento.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: "Falha ao gerar PDF: " + e.message }); }
});

export default router;
