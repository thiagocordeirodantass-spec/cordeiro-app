// =============================================================================
//  Gerador de XLSX (sem dependencias / sem npm)
//  -----------------------------------------------------------------------------
//  Escreve um arquivo .xlsx valido (OOXML SpreadsheetML) manualmente, usando
//  apenas modulos nativos do Node (zlib para CRC32 nao e necessario: usamos
//  ZIP no metodo "store", sem compressao, entao nao dependemos nem do zlib).
//  Mesma filosofia do gerador de PDF do backend: zero pacotes externos.
// =============================================================================
import { Buffer } from "buffer";

// ---- CRC32 (implementacao pura, tabela precomputada) ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---- DOS date/time (usamos "agora", fixo, so precisa ser valido) ----
function dosDateTime(d = new Date()) {
  const dosTime =
    ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

// ---- Escritor de ZIP (metodo STORE, sem compressao) ----
class ZipWriter {
  constructor() {
    this.entries = [];
    this.chunks = [];
    this.offset = 0;
  }
  addFile(name, content) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    const nameBuf = Buffer.from(name, "utf-8");
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime();
    const localOffset = this.offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method = 0 (store)
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    this.chunks.push(local, nameBuf, data);
    this.offset += local.length + nameBuf.length + data.length;

    this.entries.push({ nameBuf, crc, size: data.length, localOffset, dosTime, dosDate });
  }
  toBuffer() {
    const centralChunks = [];
    let centralSize = 0;
    for (const e of this.entries) {
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); // central dir header signature
      central.writeUInt16LE(20, 4); // version made by
      central.writeUInt16LE(20, 6); // version needed
      central.writeUInt16LE(0, 8); // flags
      central.writeUInt16LE(0, 10); // method
      central.writeUInt16LE(e.dosTime, 12);
      central.writeUInt16LE(e.dosDate, 14);
      central.writeUInt32LE(e.crc, 16);
      central.writeUInt32LE(e.size, 20); // compressed size
      central.writeUInt32LE(e.size, 24); // uncompressed size
      central.writeUInt16LE(e.nameBuf.length, 28);
      central.writeUInt16LE(0, 30); // extra length
      central.writeUInt16LE(0, 32); // comment length
      central.writeUInt16LE(0, 34); // disk number start
      central.writeUInt16LE(0, 36); // internal attrs
      central.writeUInt32LE(0, 38); // external attrs
      central.writeUInt32LE(e.localOffset, 42); // offset of local header
      centralChunks.push(central, e.nameBuf);
      centralSize += central.length + e.nameBuf.length;
    }
    const centralOffset = this.offset;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central dir signature
    end.writeUInt16LE(0, 4); // disk number
    end.writeUInt16LE(0, 6); // disk with central dir
    end.writeUInt16LE(this.entries.length, 8); // entries on this disk
    end.writeUInt16LE(this.entries.length, 10); // total entries
    end.writeUInt32LE(centralSize, 12); // size of central dir
    end.writeUInt32LE(centralOffset, 16); // offset of central dir
    end.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...this.chunks, ...centralChunks, end]);
  }
}

// ---- Helpers de planilha ----
function xmlEscape(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colLetter(idxZeroBased) {
  let n = idxZeroBased + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Celula: { v: valor, type: 'n'|'s' (padrao 's'), style: 0|1 }
function buildCell(rowIdx, colIdx, cellDef) {
  const ref = `${colLetter(colIdx)}${rowIdx}`;
  if (cellDef == null || cellDef.v == null || cellDef.v === "") {
    return `<c r="${ref}"${cellDef?.style ? ` s="${cellDef.style}"` : ""}/>`;
  }
  const style = cellDef.style ? ` s="${cellDef.style}"` : "";
  if (cellDef.type === "n") {
    const n = Number(cellDef.v);
    if (!isFinite(n)) {
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cellDef.v)}</t></is></c>`;
    }
    return `<c r="${ref}"${style}><v>${n}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cellDef.v)}</t></is></c>`;
}

// sheet: { name, rows: [ [ {v, type, style}, ... ], ... ], colWidths?: [n,...], freezeHeader?: bool }
function buildSheetXml(sheet) {
  const rowsXml = sheet.rows
    .map((row, i) => {
      const r = i + 1;
      const cellsXml = row.map((cell, c) => buildCell(r, c, cell)).join("");
      return `<row r="${r}">${cellsXml}</row>`;
    })
    .join("");

  let colsXml = "";
  if (sheet.colWidths && sheet.colWidths.length) {
    colsXml =
      "<cols>" +
      sheet.colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("") +
      "</cols>";
  }

  const freezeXml = sheet.freezeHeader
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${freezeXml}${colsXml}<sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0B5FFF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const CONTENT_TYPES = (sheetCount) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function buildWorkbookXml(sheetNames) {
  const sheetsXml = sheetNames
    .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsXml}</sheets>
</workbook>`;
}

function buildWorkbookRels(sheetCount) {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join("");
  const stylesRel = `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}${stylesRel}
</Relationships>`;
}

// API principal: gerarXlsx([{name, rows, colWidths, freezeHeader}, ...]) -> Buffer
export function gerarXlsx(sheets) {
  const zip = new ZipWriter();
  zip.addFile("[Content_Types].xml", CONTENT_TYPES(sheets.length));
  zip.addFile("_rels/.rels", ROOT_RELS);
  zip.addFile("xl/workbook.xml", buildWorkbookXml(sheets.map((s) => s.name)));
  zip.addFile("xl/_rels/workbook.xml.rels", buildWorkbookRels(sheets.length));
  zip.addFile("xl/styles.xml", STYLES_XML);
  sheets.forEach((sheet, i) => {
    zip.addFile(`xl/worksheets/sheet${i + 1}.xml`, buildSheetXml(sheet));
  });
  return zip.toBuffer();
}

// Helper para montar uma linha de cabecalho (estilo 1 = negrito com fundo)
export function headerRow(labels) {
  return labels.map((v) => ({ v, type: "s", style: 1 }));
}
// Helper para montar uma linha de dados simples (auto: numero vira 'n', resto 's')
export function dataRow(values, numericCols = []) {
  return values.map((v, i) => ({
    v,
    type: numericCols.includes(i) ? "n" : "s",
    style: numericCols.includes(i) ? 2 : 0,
  }));
}
