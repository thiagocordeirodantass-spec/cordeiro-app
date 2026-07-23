// =============================================================================
//  services/pdf.service.js
//  -----------------------------------------------------------------------------
//  - PdfDoc: gerador de PDF sem dependências (idêntico ao do server.js original)
//  - renderDocPdf: PDF resumo de 1 documento (NF-e ou CT-e)
//  - buildDocPdfFromXmlText: extrai dados do XML e gera o PDF de 1 documento
//  - renderRelatorioTabularPdf: NOVO — PDF tabular a partir de uma lista de docs
// =============================================================================

// ---- Utilitários de texto ----
function pdfSanitize(str) {
  return String(str ?? "")
    .normalize("NFC")
    .split("")
    .map((c) => (c.codePointAt(0) <= 255 ? c : "?"))
    .join("");
}
function pdfEscape(str) {
  return pdfSanitize(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function pdfWrap(text, maxChars) {
  const words = pdfSanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > maxChars && cur) { lines.push(cur); cur = w; } else { cur = test; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ---- Classe PdfDoc (motor de baixo nível) ----
export class PdfDoc {
  constructor() {
    this.pageWidth = 595.28;
    this.pageHeight = 841.89;
    this.marginX = 48;
    this.marginTop = 54;
    this.marginBottom = 46;
    this.pages = [];
    this._newPage();
  }
  _newPage() { this.pages.push([]); this.cursorY = this.pageHeight - this.marginTop; }
  _ops() { return this.pages[this.pages.length - 1]; }
  _ensure(h) { if (this.cursorY - h < this.marginBottom) this._newPage(); }
  space(h = 8) { this._ensure(h); this.cursorY -= h; }
  hr() {
    this._ensure(10);
    this._ops().push(`0.7 w ${this.marginX} ${this.cursorY.toFixed(1)} m ${(this.pageWidth - this.marginX).toFixed(1)} ${this.cursorY.toFixed(1)} l S`);
    this.cursorY -= 10;
  }
  line(str, { size = 10, font = "F1", gap = 13, x = this.marginX } = {}) {
    this._ensure(gap);
    this._ops().push(`BT /${font} ${size} Tf ${x} ${this.cursorY.toFixed(1)} Td (${pdfEscape(str)}) Tj ET`);
    this.cursorY -= gap;
  }
  text(str, opts = {}) { this.line(str, opts); }
  heading(str, size = 13) { this.space(4); this.line(str, { size, font: "F2", gap: size + 6 }); }
  paragraph(str, { size = 9.5, gap = 12, maxChars = 100 } = {}) {
    for (const l of pdfWrap(str, maxChars)) this.line(l, { size, gap });
  }
  kv(label, value) {
    this.line(`${label}:`, { size: 8.5, font: "F2", gap: 11 });
    this.paragraph(value == null || value === "" ? "-" : String(value), { size: 10, gap: 14 });
  }
  toBuffer() {
    const numPages = this.pages.length;
    const pageObjStart = 3;
    const contentObjStart = pageObjStart + numPages;
    const fontRegularObj = contentObjStart + numPages;
    const fontBoldObj = fontRegularObj + 1;
    const totalObjs = fontBoldObj;
    let out = "%PDF-1.4\n";
    const offsets = new Array(totalObjs + 1).fill(0);
    const addObj = (id, body) => { offsets[id] = out.length; out += `${id} 0 obj\n${body}\nendobj\n`; };
    addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
    const kids = [];
    for (let i = 0; i < numPages; i++) kids.push(`${pageObjStart + i} 0 R`);
    addObj(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${numPages} >>`);
    for (let i = 0; i < numPages; i++) {
      const pageId = pageObjStart + i, contentId = contentObjStart + i;
      addObj(pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] ` +
        `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`);
    }
    for (let i = 0; i < numPages; i++) {
      const contentId = contentObjStart + i;
      const stream = this.pages[i].join("\n");
      const length = Buffer.byteLength(stream, "latin1");
      addObj(contentId, `<< /Length ${length} >>\nstream\n${stream}\nendstream`);
    }
    addObj(fontRegularObj, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    addObj(fontBoldObj, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    const xrefStart = out.length;
    out += `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= totalObjs; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(out, "latin1");
  }
}

// ---- Formatadores ----
function fmtMoneyPdf(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  const parts = n.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${parts[0]},${parts[1]}`;
}
export function formatDatePdf(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleString("pt-BR");
}
function formatEndereco(end) {
  if (!end) return null;
  const parts = [
    [end.xLgr, end.nro].filter(Boolean).join(", "),
    end.xBairro,
    [end.xMun, end.UF].filter(Boolean).join(" - "),
    end.CEP,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
}

// ---- Importa o parser de documents.service (sem ciclo: pdf -> documents, mas não o contrário) ----
import {
  parseXml,
  detectKind as _detectKind,
  extractSummary as _extractSummary,
  extractChave as _extractChave,
  getModelo as _getModelo,
} from "./documents.service.js";

function buildDataFromXml(xmlText, kindHint) {
  const parsed = parseXml(xmlText);
  if (!parsed) return null;
  const kind = kindHint || _detectKind(parsed);
  if (kind === "OUTROS") return null;

  const data = {
    kind, modelo: _getModelo(parsed), chave: _extractChave(parsed),
    numero: null, serie: null, dataEmissao: null,
    remetenteNome: null, remetenteDoc: null,
    destinatarioNome: null, destinatarioDoc: null,
    valorTotal: null, status: "pendente", protocolo: null,
    enderEmit: null, enderDest: null, itens: [], transporte: null, totais: null,
  };
  const summary = _extractSummary(parsed) || {};
  Object.assign(data, summary);

  if (kind === "NFE") {
    const infNFe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
    if (infNFe) {
      const emit = infNFe.emit || {}, dest = infNFe.dest || {};
      data.enderEmit = formatEndereco(emit.enderEmit);
      data.enderDest = formatEndereco(dest.enderDest);
      let det = infNFe.det;
      if (det && !Array.isArray(det)) det = [det];
      data.itens = (det || []).map((d) => {
        const p = d.prod || {};
        return { xProd: p.xProd, ncm: p.NCM, cfop: p.CFOP, uCom: p.uCom, qCom: p.qCom, vUnCom: p.vUnCom, vProd: p.vProd };
      });
      const t = infNFe.total?.ICMSTot || {};
      data.totais = { vProd: t.vProd, vFrete: t.vFrete, vDesc: t.vDesc, vICMS: t.vICMS, vIPI: t.vIPI, vNF: t.vNF };
    }
  } else if (kind === "CTE") {
    const infCTe = parsed.cteProc?.CTe?.infCte || parsed.CTe?.infCte;
    if (infCTe) {
      const ide = infCTe.ide || {}, emit = infCTe.emit || {};
      data.enderEmit = [emit.xLgr && `${emit.xLgr}, ${emit.nro || ""}`, emit.xBairro,
        [emit.xMun, emit.UF].filter(Boolean).join(" - "), emit.CEP].filter(Boolean).join(" | ") || null;
      data.transporte = { modal: ide.modal, tpServ: ide.tpServ, municipioIni: ide.xMunIni, municipioFim: ide.xMunFim, ufIni: ide.UFIni, ufFim: ide.UFFim };
      const vp = infCTe.vPrest || {};
      data.totais = { vTPrest: vp.vTPrest, vRec: vp.vRec };
    }
  }
  return data;
}

export function renderDocPdf(data) {
  const pdf = new PdfDoc();
  const tipoLabel = data.kind === "NFE" ? "NF-e" : data.kind === "CTE" ? "CT-e" : "Documento Fiscal";
  const docLabel = data.kind === "NFE" ? "Resumo de NF-e (nao e o DANFE oficial)" :
                   data.kind === "CTE" ? "Resumo de CT-e (nao e o DACTE oficial)" :
                   "Resumo do documento";
  pdf.heading(docLabel, 15);
  pdf.text(`${tipoLabel}  |  Numero ${data.numero || "-"}  |  Serie ${data.serie || "-"}  |  Modelo ${data.modelo || "-"}`, { size: 10, gap: 16 });
  pdf.hr();
  pdf.space(4);
  pdf.kv("Situacao", (data.status || "-").toUpperCase());
  pdf.kv("Protocolo de autorizacao", data.protocolo || "-");
  pdf.kv("Data/hora de emissao", formatDatePdf(data.dataEmissao));
  pdf.kv("Chave de acesso", data.chave || "-");
  pdf.space(4);
  pdf.heading("Emitente", 12);
  pdf.paragraph(data.remetenteNome || "-", { size: 10.5, gap: 14 });
  pdf.paragraph(`CNPJ/CPF: ${data.remetenteDoc || "-"}`, { size: 9 });
  if (data.enderEmit) pdf.paragraph(data.enderEmit, { size: 9 });
  pdf.space(4);
  pdf.heading("Destinatario", 12);
  pdf.paragraph(data.destinatarioNome || "-", { size: 10.5, gap: 14 });
  pdf.paragraph(`CNPJ/CPF: ${data.destinatarioDoc || "-"}`, { size: 9 });
  if (data.enderDest) pdf.paragraph(data.enderDest, { size: 9 });
  if (data.kind === "CTE" && data.transporte) {
    pdf.space(4);
    pdf.heading("Dados do transporte", 12);
    pdf.paragraph(`Modal: ${data.transporte.modal || "-"}   |   Tipo de servico: ${data.transporte.tpServ || "-"}`, { size: 9 });
    pdf.paragraph(`Origem: ${data.transporte.municipioIni || "-"} / ${data.transporte.ufIni || "-"}`, { size: 9 });
    pdf.paragraph(`Destino: ${data.transporte.municipioFim || "-"} / ${data.transporte.ufFim || "-"}`, { size: 9 });
  }
  if (data.kind === "NFE" && data.itens?.length) {
    pdf.space(6);
    pdf.heading(`Itens (${data.itens.length})`, 12);
    data.itens.forEach((it, i) => {
      pdf.paragraph(
        `${i + 1}. ${it.xProd || "-"}  |  NCM ${it.ncm || "-"}  |  CFOP ${it.cfop || "-"}  |  ${it.qCom || "-"} ${it.uCom || ""} x ${fmtMoneyPdf(it.vUnCom)} = ${fmtMoneyPdf(it.vProd)}`,
        { size: 9, maxChars: 108 });
    });
  }
  pdf.space(8);
  pdf.hr();
  pdf.space(4);
  pdf.heading("Valores", 12);
  if (data.kind === "NFE" && data.totais) {
    pdf.kv("Total dos produtos", fmtMoneyPdf(data.totais.vProd));
    pdf.kv("Frete", fmtMoneyPdf(data.totais.vFrete));
    pdf.kv("Desconto", fmtMoneyPdf(data.totais.vDesc));
    pdf.kv("ICMS", fmtMoneyPdf(data.totais.vICMS));
    pdf.line(`VALOR TOTAL DA NOTA: ${fmtMoneyPdf(data.totais.vNF)}`, { size: 12, font: "F2", gap: 18 });
  } else if (data.kind === "CTE" && data.totais) {
    pdf.kv("Valor da prestacao", fmtMoneyPdf(data.totais.vTPrest));
    pdf.line(`VALOR A RECEBER: ${fmtMoneyPdf(data.totais.vRec)}`, { size: 12, font: "F2", gap: 18 });
  } else {
    pdf.line(`VALOR TOTAL: ${fmtMoneyPdf(data.valorTotal)}`, { size: 12, font: "F2", gap: 18 });
  }
  pdf.space(12);
  pdf.hr();
  pdf.space(4);
  pdf.paragraph(
    "Este PDF e um resumo gerado localmente a partir do XML, para conferencia rapida. Ele NAO e o " +
    "DANFE/DACTE oficial (sem selo grafico e QRCode validados pela SEFAZ) e nao substitui o documento " +
    "auxiliar emitido por um sistema homologado.",
    { size: 8, gap: 10.5, maxChars: 118 });
  pdf.paragraph(`Gerado em ${new Date().toLocaleString("pt-BR")} pelo Fiscal Local.`, { size: 8, gap: 10.5 });
  return pdf.toBuffer();
}

export function buildDocPdfFromXmlText(xmlText, kindHint) {
  const data = buildDataFromXml(xmlText, kindHint);
  if (!data) return null;
  return renderDocPdf(data);
}

// =============================================================================
//  NOVO — renderRelatorioTabularPdf: relatório tabular em PDF
// =============================================================================
export function renderRelatorioTabularPdf({ titulo, filtrosAplicados, columns, rows, totalLabel, totalValor, count }) {
  const pdf = new PdfDoc();
  pdf.heading(titulo || "Relatório", 15);
  pdf.text(`Gerado em ${formatDatePdf(new Date().toISOString())}  |  ${count} documento(s)`, { size: 9, gap: 14 });
  if (filtrosAplicados && filtrosAplicados !== "nenhum") {
    pdf.text(`Filtros: ${filtrosAplicados}`, { size: 9, gap: 14 });
  }
  pdf.hr();
  pdf.space(4);

  const usable = pdf.pageWidth - 2 * pdf.marginX;
  const pesos = columns.map((c) => c.width || 10);
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  const widths = pesos.map((p) => Math.max(28, Math.floor((p / soma) * usable)));
  const headerLines = columns.map((c) => pdfWrap(c.label, Math.max(4, Math.floor(widths[columns.indexOf(c)] / 5))));
  const headerHeight = Math.max(...headerLines.map((l) => l.length)) * 11 + 4;
  const rowHeight = 12;

  function drawHeader() {
    pdf._ensure(headerHeight + 4);
    const yStart = pdf.cursorY;
    let x = pdf.marginX;
    columns.forEach((c, i) => {
      const w = widths[i];
      const lines = headerLines[i];
      let ly = yStart;
      for (const line of lines) {
        pdf._ops().push(`BT /F2 8 Tf ${x} ${ly.toFixed(1)} Td (${pdfEscape(line)}) Tj ET`);
        ly -= 11;
      }
      x += w;
    });
    pdf._ops().push(`0.5 w ${pdf.marginX} ${(yStart - 8).toFixed(1)} m ${(pdf.pageWidth - pdf.marginX).toFixed(1)} ${(yStart - 8).toFixed(1)} l S`);
    pdf.cursorY = yStart - headerHeight;
  }

  function drawRow(values) {
    pdf._ensure(rowHeight + 2);
    const y = pdf.cursorY;
    let x = pdf.marginX;
    values.forEach((val, i) => {
      const w = widths[i];
      const maxChars = Math.max(4, Math.floor(w / 4.5));
      const line = (pdfWrap(String(val ?? "-"), maxChars)[0] || "");
      pdf._ops().push(`BT /F1 8 Tf ${x} ${y.toFixed(1)} Td (${pdfEscape(line)}) Tj ET`);
      x += w;
    });
    pdf.cursorY -= rowHeight;
  }

  drawHeader();
  for (const r of rows) drawRow(r);

  if (totalLabel || totalValor != null) {
    pdf.space(4);
    pdf.hr();
    pdf.line(`${totalLabel || "Total"}: ${fmtMoneyPdf(totalValor)}`, { size: 11, font: "F2", gap: 18 });
  }
  return pdf.toBuffer();
}
