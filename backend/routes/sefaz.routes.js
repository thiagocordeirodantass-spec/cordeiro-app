// =============================================================================
//  routes/sefaz.routes.js — SEFAZ com certificado A1 + provedor pago
//  -----------------------------------------------------------------------------
//  Mudancas recentes:
//    - GET  /api/sefaz/cert/listar     — lista certificados A1 instalados no Windows
//    - POST /api/sefaz/cert/lote       — aceita .pfx upload OU thumbprint do Windows
//    - POST /api/sefaz/cert/lote       — paraleliza todas as chaves (sem limite),
//                                        salva cada XML no banco automaticamente
//    - POST /api/sefaz/cert/periodo    — idem para consulta por NSU
//    - POST /api/sefaz/provedor/lote   — idem para provedor pago
// =============================================================================
import { Router } from "express";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import * as sefazDistribuicao from "../services/sefaz-distribuicao.js";
import * as sefazProvedor from "../services/sefaz-provedor.js";
import * as certWindows from "../services/cert-windows.js";
import { ZipWriter, buildZipPath } from "../zip-writer.js";
import { parseXml, saveDocument, detectKind } from "../services/documents.service.js";
import { buildDocPdfFromXmlText } from "../services/pdf.service.js";
import { requireRole } from "../middleware/requireRole.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(requireRole("admin", "operador"));

// =============================================================================
//  GET /api/sefaz/cert/listar
//  Lista os certificados A1 instalados no Windows Store do usuario
//  (CurrentUser\My) e da maquina (LocalMachine\My)
// =============================================================================
router.get("/cert/listar", async (_req, res) => {
  try {
    const certs = await certWindows.listarCertificadosWindows();
    res.json({ ok: true, certificados: certs, total: certs.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, certificados: [] });
  }
});

// =============================================================================
//  POST /api/sefaz/cert/lote
//  Busca em lote na SEFAZ via certificado A1.
//  Aceita:
//    - certificado (.pfx/.p12) via upload  + senha + cnpj + uf  OU
//    - thumbprint (cert ja instalado no Windows) + senha + cnpj + uf
//  Paraleliza TUDO (sem limite de simultaneas) e salva cada XML
//  na tabela `documents` automaticamente. Retorna um .zip com os arquivos
//  e headers X-Sefaz-* indicando quantos salvou e seus IDs.
// =============================================================================
router.post("/cert/lote", upload.single("certificado"), async (req, res) => {
  let pfxBuffer = null;
  let fromWindowsThumbprint = null;

  if (req.file) {
    pfxBuffer = req.file.buffer;
  } else if (req.body.thumbprint) {
    fromWindowsThumbprint = String(req.body.thumbprint).trim();
  } else {
    return res.status(400).json({ error: "Envie o .pfx/.p12 OU o thumbprint de um certificado instalado no Windows" });
  }

  const { senha, cnpj, uf, ambiente, formato, endpointOverride, chaves, salvarNoBanco } = req.body || {};
  if (!senha) return res.status(400).json({ error: "Informe a senha do certificado" });
  if (!cnpj) return res.status(400).json({ error: "Informe o CNPJ/CPF vinculado ao certificado" });
  if (!uf) return res.status(400).json({ error: "Informe a UF autora da consulta" });

  const listaChaves = String(chaves || "").split(/\r?\n/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length === 44);
  if (!listaChaves.length) return res.status(400).json({ error: "Nenhuma chave de acesso valida (44 digitos) informada" });

  // Se o usuario escolheu um certificado do Windows, extrai o .pfx em memoria
  if (fromWindowsThumbprint) {
    try {
      pfxBuffer = await certWindows.exportarPfxWindows(fromWindowsThumbprint, senha);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Marca cada chave como "ja importada" para pular
  const jaExistentes = new Set();
  try {
    const rows = await import("../db/index.js").then(({ db }) => db.prepare(`SELECT chave FROM documents WHERE chave IN (${listaChaves.map(() => "?").join(",")})`).all(...listaChaves));
    for (const r of rows) jaExistentes.add(r.chave);
  } catch (e) {}

  const zip = new ZipWriter();
  const manifesto = [];
  const salvos = [];     // ids salvos no banco
  const erros = [];      // [{chave, mensagem}]
  const encontrados = []; // chaves que a SEFAZ retornou OK
  let ok = 0;
  let indice = 0;

  // ---- PARALELIZACAO TOTAL: dispara todas as chaves sem esperar ----
  const tasks = listaChaves.map((chave) => (async () => {
    const i = ++indice;
    if (jaExistentes.has(chave)) {
      manifesto.push(`SKIP  ${chave}  (ja importada anteriormente)`);
      return;
    }
    try {
      const xmlText = await sefazDistribuicao.consultarChaveComCertificado({
        pfx: pfxBuffer, passphrase: senha, uf,
        ambiente: ambiente === "homologacao" ? "homologacao" : "producao",
        cnpjOuCpf: cnpj, chave,
        endpointOverride: endpointOverride || undefined,
      });

      // Salva no zip
      if (formato === "xml" || formato === "xml_pdf" || !formato) {
        zip.addFile(buildZipPath([`${chave}.xml`]), xmlText);
      }
      if (formato === "pdf" || formato === "xml_pdf") {
        const pdf = buildDocPdfFromXmlText(xmlText);
        if (pdf) zip.addFile(buildZipPath([`${chave}.pdf`]), pdf);
      }

      // Auto-save no banco (igual aba Documentos) — silencioso se falhar
      let docId = null;
      if (String(salvarNoBanco ?? "1") === "1") {
        try {
          const parsed = parseXml(xmlText);
          const kind = parsed ? detectKind(parsed) : "NFE";
          if (parsed && kind && kind !== "OUTROS") {
            const r = saveDocument({ xmlText, kind, source: "sefaz-cert" });
            if (r && r.ok) {
              docId = r.id;
              salvos.push({ chave, id: r.id, kind: r.kind });
            }
          }
        } catch (e) {
          manifesto.push(`OK    ${chave}  (xml nao salvo no banco: ${e.message})`);
          encontrados.push(chave);
          ok++;
          return;
        }
      }

      manifesto.push(`OK    ${chave}${docId ? `  (salvo id=${docId})` : ""}`);
      encontrados.push(chave);
      ok++;
    } catch (e) {
      manifesto.push(`ERRO  ${chave}  ${e.message}`);
      erros.push({ chave, mensagem: e.message });
    }
  })());

  await Promise.allSettled(tasks);

  // Manifesto final
  zip.addFile("relatorio-busca-sefaz.txt",
    [
      `Resumo: ${ok} de ${listaChaves.length} chaves consultadas com sucesso na SEFAZ.`,
      `Salvos no banco: ${salvos.length} (origem: sefaz-cert).`,
      `Ja existentes: ${jaExistentes.size}.`,
      `Erros: ${erros.length}.`,
      "",
      ...manifesto,
    ].join("\n") + "\n"
  );

  // Mesmo que nenhuma tenha dado OK, devolve o zip com o manifesto (util para debug)
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="sefaz-certificado-${stamp}.zip"`);
  res.setHeader("X-Sefaz-Ok", String(ok));
  res.setHeader("X-Sefaz-Total", String(listaChaves.length));
  res.setHeader("X-Sefaz-Salvos", String(salvos.length));
  res.setHeader("X-Sefaz-Ja-Existentes", String(jaExistentes.size));
  res.setHeader("X-Sefaz-Erros", String(erros.length));
  // Lista os IDs salvos (json em header nao cabe muito, entao usamos trailer custom)
  res.setHeader("X-Sefaz-Salvos-Ids", salvos.map((s) => `${s.chave}:${s.id}`).slice(0, 50).join(","));
  res.send(zip.toBuffer());
});

// =============================================================================
//  POST /api/sefaz/cert/periodo
//  Consulta por periodo (NSU) — tambem paraleliza e salva no banco
// =============================================================================
router.post("/cert/periodo", upload.single("certificado"), async (req, res) => {
  let pfxBuffer = null;
  if (req.file) {
    pfxBuffer = req.file.buffer;
  } else if (req.body.thumbprint) {
    try {
      pfxBuffer = await certWindows.exportarPfxWindows(String(req.body.thumbprint), req.body.senha);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  } else {
    return res.status(400).json({ error: "Envie o .pfx/.p12 OU o thumbprint" });
  }
  const { senha, cnpj, uf, ambiente, dateFrom, dateTo, formato, endpointOverride, ultNSUInicial, salvarNoBanco } = req.body || {};
  if (!senha || !cnpj || !uf) return res.status(400).json({ error: "senha, cnpj e uf sao obrigatorios" });

  try {
    const resultado = await sefazDistribuicao.consultarPeriodoComCertificado({
      pfx: pfxBuffer, passphrase: senha, uf,
      ambiente: ambiente === "homologacao" ? "homologacao" : "producao",
      cnpjOuCpf: cnpj,
      dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
      endpointOverride: endpointOverride || undefined,
      ultNSUInicial: ultNSUInicial || "0", maxIteracoes: 30,
    });
    const zip = new ZipWriter();
    const salvos = [];
    let ok = 0;
    const tasks = resultado.docs.map((doc) => (async () => {
      const chaveMatch = doc.xml.match(/<chNFe>([^<]+)<\/chNFe>/) || doc.xml.match(/Id="[A-Za-z]*(\d{44})"/);
      const chave = chaveMatch ? chaveMatch[1] : `nsu-${doc.nsu}`;
      const ehResumo = doc.xml.includes("<resNFe") || doc.xml.includes("<resEvento");
      try {
        if (formato === "xml" || formato === "xml_pdf" || !formato) {
          zip.addFile(buildZipPath([`${chave}${ehResumo ? "-resumo" : ""}.xml`]), doc.xml);
        }
        if ((formato === "pdf" || formato === "xml_pdf") && !ehResumo) {
          const pdf = buildDocPdfFromXmlText(doc.xml);
          if (pdf) zip.addFile(buildZipPath([`${chave}.pdf`]), pdf);
        }
        // Auto-save
        if (!ehResumo && String(salvarNoBanco ?? "1") === "1") {
          try {
            const parsed = parseXml(doc.xml);
            const kind = parsed ? detectKind(parsed) : "NFE";
            if (parsed && kind && kind !== "OUTROS") {
              const r = saveDocument({ xmlText: doc.xml, kind, source: "sefaz-cert-periodo" });
              if (r && r.ok) salvos.push({ chave, id: r.id });
            }
          } catch (e) {}
        }
        ok++;
      } catch (e) {}
    })());
    await Promise.allSettled(tasks);

    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="sefaz-periodo-${stamp}.zip"`);
    res.setHeader("X-Sefaz-Total", String(ok));
    res.setHeader("X-Sefaz-Salvos", String(salvos.length));
    res.setHeader("X-Sefaz-UltNSU", resultado.ultNSU);
    res.setHeader("X-Sefaz-AtingiuFim", String(resultado.atingiuFim));
    res.send(zip.toBuffer());
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// =============================================================================
//  Provedor pago
// =============================================================================
router.get("/provedor/config", (_req, res) => res.json(sefazProvedor.maskConfig(sefazProvedor.loadConfig(DATA_DIR))));
router.post("/provedor/config", (req, res) => {
  const { token, endpoint, chaveParam } = req.body || {};
  const partial = {};
  if (token !== undefined) partial.token = String(token || "").trim();
  if (endpoint) partial.endpoint = String(endpoint).trim();
  if (chaveParam) partial.chaveParam = String(chaveParam).trim();
  res.json(sefazProvedor.maskConfig(sefazProvedor.saveConfig(DATA_DIR, partial)));
});

router.post("/provedor/lote", async (req, res) => {
  const { chaves, formato, salvarNoBanco } = req.body || {};
  const listaChaves = String(chaves || "").split(/\r?\n/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length === 44);
  if (!listaChaves.length) return res.status(400).json({ error: "Nenhuma chave de acesso valida (44 digitos) informada" });
  const cfg = sefazProvedor.loadConfig(DATA_DIR);
  const zip = new ZipWriter();
  const salvos = [];
  let ok = 0;
  const tasks = listaChaves.map((chave) => (async () => {
    try {
      const xmlText = await sefazProvedor.chaveParaXml(cfg, chave);
      if (formato === "xml" || formato === "xml_pdf" || !formato) {
        zip.addFile(buildZipPath([`${chave}.xml`]), xmlText);
      }
      if (formato === "pdf" || formato === "xml_pdf") {
        const pdf = buildDocPdfFromXmlText(xmlText);
        if (pdf) zip.addFile(buildZipPath([`${chave}.pdf`]), pdf);
      }
      if (String(salvarNoBanco ?? "1") === "1") {
        try {
          const parsed = parseXml(xmlText);
          const kind = parsed ? detectKind(parsed) : "NFE";
          if (parsed && kind && kind !== "OUTROS") {
            const r = saveDocument({ xmlText, kind, source: "sefaz-provedor" });
            if (r && r.ok) salvos.push({ chave, id: r.id });
          }
        } catch (e) {}
      }
      ok++;
    } catch (e) {}
  })());
  await Promise.allSettled(tasks);

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="sefaz-provedor-${stamp}.zip"`);
  res.setHeader("X-Sefaz-Ok", String(ok));
  res.setHeader("X-Sefaz-Total", String(listaChaves.length));
  res.setHeader("X-Sefaz-Salvos", String(salvos.length));
  res.setHeader("X-Sefaz-Salvos-Ids", salvos.map((s) => `${s.chave}:${s.id}`).slice(0, 50).join(","));
  res.send(zip.toBuffer());
});

export default router;
