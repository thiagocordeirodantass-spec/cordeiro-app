// =============================================================================
//  routes/relatorios.routes.js
//  -----------------------------------------------------------------------------
//  Endpoints:
//    GET  /api/relatorio/xlsx              — Excel (padrão ou personalizado)
//    GET  /api/relatorio/csv               — NOVO: CSV
//    GET  /api/relatorio/pdf               — NOVO: PDF tabular
//    GET  /api/relatorio/lote              — download em lote (zip)
//    GET  /api/relatorio/templates         — listar templates
//    POST /api/relatorio/templates         — criar template
//    GET  /api/relatorio/templates/:id     — obter template
//    PUT  /api/relatorio/templates/:id     — atualizar
//    DELETE /api/relatorio/templates/:id   — remover
//    GET  /api/relatorio/historico         — listar execuções
//    POST /api/relatorio/historico/:id/rebaixar — re-gerar a partir do histórico
// =============================================================================
import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db/index.js";
import { getXmlPathByRow, parseXml } from "../services/documents.service.js";
import { COLUNAS_DISPONIVEIS, CAMPOS_PERMITIDOS, filtrosToString, buscarDocs, formatRow, resumo, semSufixoZero, TEMPLATES_MODULOS } from "../services/relatorio.service.js";
import { gerarXlsx, headerRow, dataRow } from "../services/xlsx.service.js";
import { buildCsv } from "../services/csv.service.js";
import { renderRelatorioTabularPdf, formatDatePdf, buildDocPdfFromXmlText } from "../services/pdf.service.js";
import { ZipWriter, buildZipPath } from "../zip-writer.js";
import * as templates from "../services/templates.service.js";
import * as audit from "../services/audit.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ---- Helpers comuns ----
const RELATORIO_COLS = [
  "Número", "Série", "Chave de acesso", "Emissão", "UF Emit.", "UF Dest.",
  "Remetente", "Doc. Remetente", "Destinatário", "Doc. Destinatário",
  "Valor", "Status", "Protocolo", "Origem",
];
const RELATORIO_WIDTHS = [10, 8, 26, 18, 8, 8, 28, 18, 28, 18, 14, 12, 18, 10];

function docRowToXlsx(d) {
  return dataRow(
    [
      semSufixoZero(d.numero), semSufixoZero(d.serie), d.chave || "",
      formatDatePdf(d.data_emissao), d.uf_emitente || "", d.uf_destino || "",
      d.remetente_nome || "", semSufixoZero(d.remetente_doc),
      d.destinatario_nome || "", semSufixoZero(d.destinatario_doc),
      Number(d.valor_total) || 0, d.status || "",
      semSufixoZero(d.protocolo), d.source || "",
    ],
    [10]
  );
}

function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
}

// =============================================================================
//  GET /api/relatorio/campos
//  Lista todas as colunas disponíveis para uso em /api/relatorio/{xlsx,csv,pdf}?campos=
// =============================================================================
router.get("/campos", (_req, res) => {
  const campos = Object.entries(COLUNAS_DISPONIVEIS).map(([key, def]) => ({
    key,
    label: def.label,
    width: def.width || 12,
    numeric: !!def.numeric,
  }));
  res.json({ campos, total: campos.length });
});

// =============================================================================
//  GET /api/relatorio/templates-modulos
//  Retorna os templates pré-definidos por módulo (NFE, CTE, GERAIS)
// =============================================================================
router.get("/templates-modulos", (_req, res) => {
  const out = {};
  for (const [modulo, tpls] of Object.entries(TEMPLATES_MODULOS)) {
    out[modulo] = Object.entries(tpls).map(([nome, campos]) => ({
      nome, campos,
    }));
  }
  res.json(out);
});

// =============================================================================
//  GET /api/relatorio/xlsx
// =============================================================================
router.get("/xlsx", (req, res) => {
  try {
    const docs = buscarDocs(req.query);
    let buffer;
    let filename;

    if (req.query.campos) {
      const campos = String(req.query.campos).split(",").map((c) => c.trim()).filter((c) => CAMPOS_PERMITIDOS.includes(c));
      if (!campos.length) return res.status(400).json({ error: "Nenhuma coluna valida informada em 'campos'" });
      const labels = campos.map((c) => COLUNAS_DISPONIVEIS[c].label);
      const numericCols = campos.map((c, i) => (COLUNAS_DISPONIVEIS[c].numeric ? i : -1)).filter((i) => i >= 0);
      const rows = docs.map((d) => dataRow(formatRow(d, campos), numericCols));
      buffer = gerarXlsx([{
        name: "Relatório", colWidths: campos.map(() => 18), freezeHeader: true,
        rows: [headerRow(labels), ...rows],
      }]);
      filename = `relatorio-personalizado-${stamp()}.xlsx`;
    } else {
      const nfes = docs.filter((d) => d.kind === "NFE");
      const ctes = docs.filter((d) => d.kind === "CTE");
      const incluirItens = String(req.query.itens || "") === "1";
      const totalAutorizado = docs.filter((d) => d.status === "autorizado").reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
      const r = resumo(docs);
      const sheets = [{
        name: "Resumo", colWidths: [28, 22], rows: [
          headerRow(["Métrica", "Valor"]),
          dataRow(["Gerado em", formatDatePdf(new Date().toISOString())]),
          dataRow(["Filtros aplicados", filtrosToString(req.query)]),
          dataRow(["Total de documentos", r.total], [1]),
          dataRow(["Total NF-e", r.nfe], [1]),
          dataRow(["Total CT-e", r.cte], [1]),
          dataRow(["Autorizados", r.autorizados], [1]),
          dataRow(["Cancelados", r.cancelados], [1]),
          dataRow(["Valor total (autorizados)", r.valorAutorizado], [1]),
        ],
      }, {
        name: "NF-e", colWidths: RELATORIO_WIDTHS, freezeHeader: true,
        rows: [headerRow(RELATORIO_COLS), ...nfes.map(docRowToXlsx)],
      }, {
        name: "CT-e", colWidths: RELATORIO_WIDTHS, freezeHeader: true,
        rows: [headerRow(RELATORIO_COLS), ...ctes.map(docRowToXlsx)],
      }];

      if (incluirItens) {
        const itensRows = [];
        for (const d of nfes) {
          try {
            const xmlText = fs.readFileSync(getXmlPathByRow(d), "utf-8");
            const parsed = parseXml(xmlText);
            if (!parsed) continue;
            // extrai itens usando documents.service indiretamente
            const infNFe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
            if (!infNFe) continue;
            let det = infNFe.det; if (det && !Array.isArray(det)) det = [det];
            for (const it of (det || [])) {
              const p = it.prod || {};
              itensRows.push(dataRow(
                [d.numero || "", d.chave || "", p.xProd || "", p.NCM || "", p.CFOP || "",
                 p.uCom || "", Number(p.qCom) || 0, Number(p.vUnCom) || 0, Number(p.vProd) || 0],
                [6, 7, 8]
              ));
            }
          } catch (e) {}
        }
        sheets.push({
          name: "Itens NF-e", colWidths: [10, 26, 30, 12, 10, 8, 12, 14, 14], freezeHeader: true,
          rows: [headerRow(["Número NF-e", "Chave", "Produto", "NCM", "CFOP", "Unid.", "Qtd.", "Vlr. Unit.", "Vlr. Total"]), ...itensRows],
        });
      }

      buffer = gerarXlsx(sheets);
      filename = `relatorio-fiscal-${stamp()}.xlsx`;
    }

    audit.registrar({
      userId: req.user.id, username: req.user.username, formato: "xlsx",
      filtros: req.query, totalDocs: docs.length, tamanhoBytes: buffer.length,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: "Falha ao gerar relatorio: " + e.message }); }
});

// =============================================================================
//  GET /api/relatorio/csv  (NOVO)
// =============================================================================
router.get("/csv", (req, res) => {
  try {
    const docs = buscarDocs(req.query);
    const campos = (req.query.campos ? String(req.query.campos).split(",").map((c) => c.trim()).filter((c) => CAMPOS_PERMITIDOS.includes(c))
      : CAMPOS_PERMITIDOS);
    const columns = campos.map((c) => ({
      key: c, label: COLUNAS_DISPONIVEIS[c].label, numeric: !!COLUNAS_DISPONIVEIS[c].numeric,
      get: COLUNAS_DISPONIVEIS[c].get,
    }));
    const csv = buildCsv(columns, docs);

    audit.registrar({
      userId: req.user.id, username: req.user.username, formato: "csv",
      filtros: req.query, totalDocs: docs.length, tamanhoBytes: Buffer.byteLength(csv, "utf-8"),
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${stamp()}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: "Falha ao gerar CSV: " + e.message }); }
});

// =============================================================================
//  GET /api/relatorio/pdf  (NOVO)
// =============================================================================
router.get("/pdf", (req, res) => {
  try {
    const docs = buscarDocs(req.query);
    const campos = (req.query.campos ? String(req.query.campos).split(",").map((c) => c.trim()).filter((c) => CAMPOS_PERMITIDOS.includes(c))
      : CAMPOS_PERMITIDOS);
    const columns = campos.map((c) => ({
      key: c, label: COLUNAS_DISPONIVEIS[c].label, width: COLUNAS_DISPONIVEIS[c].width || 12,
    }));
    const rows = docs.map((d) => formatRow(d, campos).map((v) => v == null ? "-" : String(v)));
    const r = resumo(docs);
    const pdf = renderRelatorioTabularPdf({
      titulo: "Relatório Fiscal",
      filtrosAplicados: filtrosToString(req.query),
      columns, rows, count: docs.length,
      totalLabel: "Valor total (autorizados)",
      totalValor: r.valorAutorizado,
    });

    audit.registrar({
      userId: req.user.id, username: req.user.username, formato: "pdf",
      filtros: req.query, totalDocs: docs.length, tamanhoBytes: pdf.length,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${stamp()}.pdf"`);
    res.send(pdf);
  } catch (e) { res.status(500).json({ error: "Falha ao gerar PDF: " + e.message }); }
});

// =============================================================================
//  GET /api/relatorio/lote  (.zip em lote)
// =============================================================================
router.get("/lote", (req, res) => {
  try {
    const docs = buscarDocs(req.query);
    if (!docs.length) return res.status(404).json({ error: "Nenhum documento encontrado com esses filtros" });

    const formato = req.query.formato || "xml_pdf";
    const organizar = String(req.query.organizar ?? "1") === "1";
    const meuCnpjDigits = String(req.query.meuCnpj || "").replace(/\D/g, "");

    const zip = new ZipWriter();
    let count = 0;
    for (const d of docs) {
      let xmlText = null;
      try { xmlText = fs.readFileSync(getXmlPathByRow(d), "utf-8"); } catch (e) { continue; }

      const nomeEmpresaPasta = d.remetente_nome || d.remetente_doc || "Emitente desconhecido";
      const periodoPasta = (d.data_emissao || "").slice(0, 7) || "sem-data";
      const statusPasta = d.status === "cancelado" ? "Cancelada" : (d.status === "denegado" || d.status === "rejeitado" ? "Substituida" : null);
      let papelPasta;
      if (!meuCnpjDigits) papelPasta = d.kind === "NFE" ? "NFe" : "CTe";
      else {
        const rem = String(d.remetente_doc || "").replace(/\D/g, "");
        const dest = String(d.destinatario_doc || "").replace(/\D/g, "");
        if (rem.includes(meuCnpjDigits)) papelPasta = "Emitidas";
        else if (dest.includes(meuCnpjDigits)) papelPasta = "Recebidas";
        else papelPasta = d.kind === "NFE" ? "NFe" : "CTe";
      }
      const partes = organizar ? [nomeEmpresaPasta, periodoPasta, papelPasta, statusPasta].filter(Boolean) : [];
      const baseName = `${d.kind}-${semSufixoZero(d.numero) || d.chave || d.id}`;
      if (formato === "xml" || formato === "xml_zip" || formato === "xml_pdf") {
        zip.addFile(buildZipPath([...partes, `${baseName}.xml`]), xmlText);
      }
      if (formato === "pdf" || formato === "xml_pdf") {
        try {
          const pdf = buildDocPdfFromXmlText(xmlText, d.kind);
          if (pdf) zip.addFile(buildZipPath([...partes, `${baseName}.pdf`]), pdf);
        } catch (e) {}
      }
      count++;
    }
    if (!count) return res.status(404).json({ error: "Nenhum XML encontrado no disco para os documentos filtrados" });
    const buf = zip.toBuffer();
    audit.registrar({
      userId: req.user.id, username: req.user.username, formato: "zip",
      filtros: req.query, totalDocs: count, tamanhoBytes: buf.length,
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="documentos-${stamp()}.zip"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: "Falha ao gerar pacote: " + e.message }); }
});

// =============================================================================
//  Templates
// =============================================================================
router.get("/templates", (req, res) => res.json(templates.listarTemplates(req.user)));

router.post("/templates", (req, res) => {
  try { res.json(templates.criarTemplate(req.user, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/templates/:id", (req, res) => {
  const t = templates.obterTemplate(Number(req.params.id), req.user);
  if (!t) return res.status(404).json({ error: "Template não encontrado ou sem acesso" });
  res.json(t);
});

router.put("/templates/:id", (req, res) => {
  try { res.json(templates.atualizarTemplate(Number(req.params.id), req.user, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete("/templates/:id", (req, res) => {
  try { res.json(templates.removerTemplate(Number(req.params.id), req.user)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// =============================================================================
//  Histórico de relatórios
// =============================================================================
router.get("/historico", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const todos = req.query.todos === "1";
  res.json(audit.listar({ user: req.user, limit, todos }));
});

router.post("/historico/:id/rebaixar", (req, res) => {
  const h = audit.obter(Number(req.params.id), req.user);
  if (!h) return res.status(404).json({ error: "Entrada de histórico não encontrada" });
  if (!h.filtros) return res.status(400).json({ error: "Histórico sem filtros registrados" });
  // Redireciona para o endpoint apropriado conforme o formato original
  const qs = new URLSearchParams(h.filtros || {}).toString();
  const base = h.formato === "xlsx" ? "/api/relatorio/xlsx"
             : h.formato === "csv" ? "/api/relatorio/csv"
             : h.formato === "pdf" ? "/api/relatorio/pdf"
             : h.formato === "zip" ? "/api/relatorio/lote"
             : null;
  if (!base) return res.status(400).json({ error: "Formato desconhecido" });
  res.redirect(302, `${base}?${qs}`);
});

export default router;
