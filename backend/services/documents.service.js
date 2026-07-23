// =============================================================================
//  services/documents.service.js
//  -----------------------------------------------------------------------------
//  Toda a lógica de manipulação de documentos fiscais:
//    - parseXml, detectKind, getModelo, extractChave, extractSummary
//    - saveDocument (upsert pela chave)
//    - geração de XML a partir de JSON (NF-e e CT-e, sem assinatura)
//  Reaproveita funções idênticas ao server.js original, sem mudança de
//  comportamento para preservar o contrato dos endpoints.
// =============================================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { db } from "../db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const XML_DIR = path.resolve(__dirname, "..", "..", "data", "xml");

// ---- Parser / Builder XML ----
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
});

export const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "  ",
  suppressEmptyNode: false,
});

export function parseXml(text) {
  try {
    return xmlParser.parse(text);
  } catch (e) {
    return null;
  }
}

export function detectKind(parsed) {
  if (!parsed) return null;
  if (parsed.nfeProc?.NFe || parsed.NFe) return "NFE";
  if (parsed.cteProc?.CTe || parsed.CTe) return "CTE";
  if (parsed.procNFe?.NFe) return "NFE";
  if (parsed.procCTe?.CTe) return "CTE";
  return "OUTROS";
}

export function getModelo(parsed) {
  if (!parsed) return null;
  const infNFe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
  if (infNFe) {
    return infNFe.ide?.mod || parsed.nfeProc?.NFe?.infNFe?.ide?.mod;
  }
  const infCTe = parsed.cteProc?.CTe?.infCte || parsed.CTe?.infCte;
  if (infCTe) {
    return "57";
  }
  return null;
}

export function extractChave(parsed) {
  if (!parsed) return null;
  const infNFe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
  if (infNFe) {
    const id = infNFe["@_Id"] || "";
    return id.replace(/^NFe/, "");
  }
  const infCTe = parsed.cteProc?.CTe?.infCte || parsed.CTe?.infCte;
  if (infCTe) {
    const id = infCTe["@_Id"] || "";
    return id.replace(/^CTe/, "");
  }
  return null;
}

// ---- Destrincha o XML inteiro: extrai TODOS os campos relevantes ----
// Retorna objeto plano {chave: valor, ...} usado para popular a coluna xml_data
// e expor como colunas opcionais nos relatorios.
export function extractFullXmlData(parsed) {
  if (!parsed) return {};
  const out = {};

  const infNFe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
  if (infNFe) {
    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const enderEmit = emit.enderEmit || {};
    const enderDest = dest.enderDest || {};
    const total = infNFe.total?.ICMSTot || {};
    const transp = infNFe.transp || {};
    const transpVol = (transp.vol || [])[0] || transp.vol || {};
    const cobr = infNFe.cobr || {};
    const fat = cobr.fat || {};
    const dup = Array.isArray(cobr.dup) ? cobr.dup : (cobr.dup ? [cobr.dup] : []);
    const pag = infNFe.pag || {};
    const detPag = Array.isArray(pag.detPag) ? pag.detPag : (pag.detPag ? [pag.detPag] : []);
    const prot = parsed.nfeProc?.protNFe?.infProt;

    // Identificacao
    out.natOp = ide.natOp;
    out.mod = ide.mod;
    out.serie = ide.serie;
    out.numero = ide.nNF;
    out.dataEmissao = ide.dhEmi || ide.dEmi;
    out.tpNF = ide.tpNF;
    out.idDest = ide.idDest;
    out.cMunFG = ide.cMunFG;
    out.tpImp = ide.tpImp;
    out.tpEmis = ide.tpEmis;
    out.cDV = ide.cDV;
    out.tpAmb = ide.tpAmb;
    out.finNFe = ide.finNFe;
    out.indFinal = ide.indFinal;
    out.indPres = ide.indPres;

    // Emitente
    out.emitCNPJ = emit.CNPJ;
    out.emitCPF = emit.CPF;
    out.emitNome = emit.xNome;
    out.emitFantasia = emit.xFant;
    out.emitIE = emit.IE;
    out.emitIEST = emit.IEST;
    out.emitIM = emit.IM;
    out.emitCNAE = emit.CNAE;
    out.emitCRT = emit.CRT;
    out.emitLogradouro = enderEmit.xLgr;
    out.emitNumero = enderEmit.nro;
    out.emitComplemento = enderEmit.xCpl;
    out.emitBairro = enderEmit.xBairro;
    out.emitCodMun = enderEmit.cMun;
    out.emitMun = enderEmit.xMun;
    out.emitUF = enderEmit.UF;
    out.emitCEP = enderEmit.CEP;
    out.emitCodPais = enderEmit.cPais;
    out.emitPais = enderEmit.xPais;
    out.emitFone = enderEmit.fone;

    // Destinatario
    out.destCNPJ = dest.CNPJ;
    out.destCPF = dest.CPF;
    out.destEstrangeiro = dest.idEstrangeiro;
    out.destNome = dest.xNome;
    out.destIE = dest.IE;
    out.destEmail = dest.email;
    out.destLogradouro = enderDest.xLgr;
    out.destNumero = enderDest.nro;
    out.destComplemento = enderDest.xCpl;
    out.destBairro = enderDest.xBairro;
    out.destCodMun = enderDest.cMun;
    out.destMun = enderDest.xMun;
    out.destUF = enderDest.UF;
    out.destCEP = enderDest.CEP;
    out.destCodPais = enderDest.cPais;
    out.destPais = enderDest.xPais;
    out.destFone = enderDest.fone;

    // Totais
    out.vBC = total.vBC;
    out.vICMS = total.vICMS;
    out.vICMSDeson = total.vICMSDeson;
    out.vFCP = total.vFCP;
    out.vBCST = total.vBCST;
    out.vST = total.vST;
    out.vFCPST = total.vFCPST;
    out.vFCPSTRet = total.vFCPSTRet;
    out.vProd = total.vProd;
    out.vFrete = total.vFrete;
    out.vSeg = total.vSeg;
    out.vDesc = total.vDesc;
    out.vII = total.vII;
    out.vIPI = total.vIPI;
    out.vIPIDevol = total.vIPIDevol;
    out.vPIS = total.vPIS;
    out.vCOFINS = total.vCOFINS;
    out.vOutro = total.vOutro;
    out.vNF = total.vNF;
    out.vTotTrib = total.vTotTrib;

    // UF origem/destino (alias de emitUF/destUF para retro-compat)
    out.ufEmitente = out.emitUF;
    out.ufDestino = out.destUF;

    // Transporte
    out.modFrete = transp.modFrete;
    out.transportaCNPJ = transp.transporta?.CNPJ;
    out.transportaCPF = transp.transporta?.CPF;
    out.transportaNome = transp.transporta?.xNome;
    out.transportaIE = transp.transporta?.IE;
    out.transportaEndereco = transp.transporta?.xEnder;
    out.transportaMun = transp.transporta?.xMun;
    out.transportaUF = transp.transporta?.UF;
    out.veicPlaca = transp.veicTransp?.placa;
    out.veicUF = transp.veicTransp?.UF;
    out.veicRNTC = transp.veicTransp?.RNTC;
    out.reboquePlaca = (transp.reboque || [])[0]?.placa;
    out.volQVol = transpVol.qVol;
    out.volEsp = transpVol.esp;
    out.volMarca = transpVol.marca;
    out.volPesoL = transpVol.pesoL;
    out.volPesoB = transpVol.pesoB;

    // Cobranca
    out.fatNumero = fat.nFat;
    out.fatValorOriginal = fat.vOrig;
    out.fatValorDesconto = fat.vDesc;
    out.fatValorLiquido = fat.vLiq;
    out.duplicatas = dup.length
      ? dup.map((d) => `${d.nDup || ""} (${d.dVenc || ""} - ${d.vDup || ""})`).join(" | ")
      : null;
    out.dupQuantidade = dup.length;

    // Pagamento
    out.pagForma = pag.tPag ? (Array.isArray(pag.tPag) ? pag.tPag.join(",") : String(pag.tPag)) : null;
    out.pagValor = pag.vPag;
    if (detPag.length) {
      out.detPagResumo = detPag.map((p) => `${p.tPag || ""}:${p.vPag || ""}`).join(" | ");
      const t = new Set();
      for (const p of detPag) if (p.tPag) t.add(String(p.tPag));
      out.detPagFormas = Array.from(t).join(",");
    }

    // Itens (agregado)
    let det = infNFe.det;
    if (det && !Array.isArray(det)) det = [det];
    if (Array.isArray(det)) {
      out.itensQuantidade = det.length;
      out.itensProdutos = det.map((it) => it.prod?.xProd).filter(Boolean).join(" | ");
      const cfops = new Set();
      for (const it of det) if (it.prod?.CFOP) cfops.add(String(it.prod.CFOP));
      out.itensCFOPs = Array.from(cfops).join(",");
      const ncms = new Set();
      for (const it of det) if (it.prod?.NCM) ncms.add(String(it.prod.NCM));
      out.itensNCMs = Array.from(ncms).join(",");
    }

    // Protocolo de autorizacao
    if (prot) {
      out.protAmbiente = prot.tpAmb;
      out.protNumero = prot.nProt;
      out.protDataHora = prot.dhRecbto;
      out.protStatus = prot.cStat;
      out.protMotivo = prot.xMotivo;
    }

    return out;
  }

  const infCTe = parsed.cteProc?.CTe?.infCte || parsed.CTe?.infCte;
  if (infCTe) {
    const ide = infCTe.ide || {};
    const emit = infCTe.emit || {};
    const rem = infCTe.rem || {};
    const dest = infCTe.dest || {};
    const enderEmit = emit.enderEmit || {};
    const enderRem = rem.enderReme || {};
    const enderDest = dest.enderDest || {};
    const vPrest = infCTe.vPrest || {};
    const imp = infCTe.imp || {};
    const icms = imp.ICMS || {};
    const icmsSn = icms.ICMSSN || {};
    const infNF = Array.isArray(infCTe.infNF) ? infCTe.infNF : (infCTe.infNF ? [infCTe.infNF] : (infCTe.infDoc?.infNF ? [infCTe.infDoc.infNF] : []));
    const infNFe2 = Array.isArray(infCTe.infNFe) ? infCTe.infNFe : (infCTe.infNFe ? [infCTe.infNFe] : (infCTe.infDoc?.infNFe ? [infCTe.infDoc.infNFe] : []));
    const prot = parsed.cteProc?.protCTe?.infProt;
    const seg = (infCTe.seg || [])[0] || infCTe.seg || {};
    const modal = ide.modal || "";
    const modals = { "01": "Rodoviário", "02": "Aéreo", "03": "Aquaviário", "04": "Ferroviário", "05": "Dutoviário", "06": "Multimodal" };

    out.mod = "57";
    out.modal = modal;
    out.modalDescricao = modals[modal] || modal;
    out.serie = ide.serie;
    out.numero = ide.nCT;
    out.dataEmissao = ide.dhEmi || ide.dEmi;
    out.tpEmis = ide.tpEmis;
    out.tpAmb = ide.tpAmb;
    out.tpCTe = ide.tpCTe;
    out.procEmi = ide.procEmi;
    out.verProc = ide.verProc;
    out.cDV = ide.cDV;
    out.cMunEnv = ide.cMunEnv;
    out.xMunEnv = ide.xMunEnv;
    out.UFEnv = ide.UFEnv;
    out.cMunIni = ide.cMunIni;
    out.xMunIni = ide.xMunIni;
    out.UFIni = ide.UFIni;
    out.cMunFim = ide.cMunFim;
    out.xMunFim = ide.xMunFim;
    out.UFFim = ide.UFFim;
    out.retira = ide.retira;
    out.tpServ = ide.tpServ;
    out.indIEToma = ide.indIEToma;
    out.toma = ide.toma;
    out.dhCont = ide.dhCont;
    out.xJust = ide.xJust;

    // Emitente do CT-e (transportadora)
    out.emitCNPJ = emit.CNPJ;
    out.emitCPF = emit.CPF;
    out.emitNome = emit.xNome;
    out.emitFantasia = emit.xFant;
    out.emitIE = emit.IE;
    out.emitIEST = emit.IEST;
    out.emitIM = emit.IM;
    out.emitCNAE = emit.CNAE;
    out.emitCRT = emit.CRT;
    out.emitLogradouro = enderEmit.xLgr;
    out.emitNumero = enderEmit.nro;
    out.emitBairro = enderEmit.xBairro;
    out.emitCodMun = enderEmit.cMun;
    out.emitMun = enderEmit.xMun;
    out.emitUF = enderEmit.UF;
    out.emitCEP = enderEmit.CEP;
    out.emitFone = enderEmit.fone;

    // Remetente
    out.remCNPJ = rem.CNPJ;
    out.remCPF = rem.CPF;
    out.remNome = rem.xNome;
    out.remIE = rem.IE;
    out.remEmail = rem.email;
    out.remLogradouro = enderRem.xLgr;
    out.remNumero = enderRem.nro;
    out.remBairro = enderRem.xBairro;
    out.remCodMun = enderRem.cMun;
    out.remMun = enderRem.xMun;
    out.remUF = enderRem.UF;
    out.remCEP = enderRem.CEP;
    out.remFone = enderRem.fone;

    // Destinatario
    out.destCNPJ = dest.CNPJ;
    out.destCPF = dest.CPF;
    out.destNome = dest.xNome;
    out.destIE = dest.IE;
    out.destEmail = dest.email;
    out.destLogradouro = enderDest.xLgr;
    out.destNumero = enderDest.nro;
    out.destBairro = enderDest.xBairro;
    out.destCodMun = enderDest.cMun;
    out.destMun = enderDest.xMun;
    out.destUF = enderDest.UF;
    out.destCEP = enderDest.CEP;
    out.destFone = enderDest.fone;

    // Valores de prestacao
    out.vTPrest = vPrest.vTPrest;
    out.vRec = vPrest.vRec;
    out.componentes = Array.isArray(vPrest.Comp) ? vPrest.Comp.map((c) => `${c.xNome || ""}:${c.vComp || ""}`).join(" | ") : null;

    // Imposto
    const icmsRoot = imp.ICMS?.ICMS00 || imp.ICMS?.ICMS20 || imp.ICMS?.ICMS45 || imp.ICMS?.ICMS60 || imp.ICMS?.ICMS90 || imp.ICMS?.ICMSOutraUF || icmsSn || {};
    out.impCST = icmsRoot.CST || icmsRoot.CSOSN;
    out.impVBC = icmsRoot.vBC;
    out.impPICMS = icmsRoot.pICMS;
    out.impVICMS = icmsRoot.vICMS;
    out.impVBCSTRet = icmsRoot.vBCSTRet;
    out.impVICMSSTRet = icmsRoot.vICMSSTRet;
    out.impVTotTrib = infCTe.imp?.vTotTrib;

    // Documentos referenciados
    out.docRefChaves = infNFe2.map((d) => d.chave).filter(Boolean).join(",");
    out.docRefNFe = infNFe2.length || null;
    if (infNF.length) {
      out.docRefNF = infNF.map((n) => `${n.nDoc || ""} (${n.serie || ""})`).join(" | ");
    }

    // Seguranca/seguro
    if (seg) {
      out.segResponsavel = seg.respSeg;
      out.segNumeroApolice = seg.nApol;
      out.segNomeSeguradora = seg.xSeg;
      out.segNumeroAverbacao = seg.nAver;
      out.segValor = seg.vCarga;
    }

    // Protocolo
    if (prot) {
      out.protAmbiente = prot.tpAmb;
      out.protNumero = prot.nProt;
      out.protDataHora = prot.dhRecbto;
      out.protStatus = prot.cStat;
      out.protMotivo = prot.xMotivo;
    }

    // Totais (alias para o relatorio usar)
    out.valorTotal = out.vTPrest;
    out.ufEmitente = out.UFIni;
    out.ufDestino = out.UFFim;

    return out;
  }

  return {};
}

export function extractSummary(parsed) {
  if (!parsed) return null;
  const summary = {
    numero: null, serie: null, dataEmissao: null,
    ufEmitente: null, ufDestino: null,
    remetenteNome: null, remetenteDoc: null,
    destinatarioNome: null, destinatarioDoc: null,
    valorTotal: null, status: "pendente", protocolo: null,
  };

  const infNFe = parsed.nfeProc?.NFe?.infNFe || parsed.NFe?.infNFe;
  if (infNFe) {
    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const total = infNFe.total?.ICMSTot || {};
    const prot = parsed.nfeProc?.protNFe?.infProt;

    summary.numero = ide.nNF || null;
    summary.serie = ide.serie || null;
    summary.dataEmissao = ide.dhEmi || ide.dEmi || null;
    summary.ufEmitente = ide.UFIni || ide.orig || emit.enderEmit?.UF || null;
    summary.ufDestino = ide.UFFim || ide.dest || dest.enderDest?.UF || null;
    summary.remetenteNome = emit.xNome || null;
    summary.remetenteDoc = emit.CNPJ || emit.CPF || null;
    summary.destinatarioNome = dest.xNome || null;
    summary.destinatarioDoc = dest.CNPJ || dest.CPF || null;
    summary.valorTotal = total.vNF || null;
    summary.protocolo = prot?.nProt || null;
    const cStat = String(prot?.cStat ?? "");
    if (cStat === "100") summary.status = "autorizado";
    else if (cStat === "101" || cStat === "151") summary.status = "cancelado";
    else if (cStat === "110" || cStat === "301" || cStat === "302") summary.status = "denegado";
    else if (cStat) summary.status = "rejeitado";
    return summary;
  }

  const infCTe = parsed.cteProc?.CTe?.infCte || parsed.CTe?.infCte;
  if (infCTe) {
    const ide = infCTe.ide || {};
    const emit = infCTe.emit || {};
    const rem = infCTe.rem || {};
    const dest = infCTe.dest || {};
    const vPrest = infCTe.vPrest || {};
    const prot = parsed.cteProc?.protCTe?.infProt;
    const canc = parsed.cteProc?.cancCTe?.infCanc;

    summary.numero = ide.nCT || null;
    summary.serie = ide.serie || null;
    summary.dataEmissao = ide.dhEmi || ide.dEmi || null;
    summary.ufEmitente = ide.UFIni || emit.enderEmit?.UF || null;
    summary.ufDestino = ide.UFFim || null;
    summary.remetenteNome = rem.xNome || null;
    summary.remetenteDoc = rem.CNPJ || rem.CPF || null;
    summary.destinatarioNome = dest.xNome || null;
    summary.destinatarioDoc = dest.CNPJ || dest.CPF || null;
    summary.valorTotal = vPrest.vTPrest || null;
    summary.protocolo = prot?.nProt || null;
    if (canc) summary.status = "cancelado";
    else {
      const cStat = String(prot?.cStat ?? "");
      if (cStat === "100") summary.status = "autorizado";
      else if (cStat === "110" || cStat === "302") summary.status = "denegado";
      else if (cStat) summary.status = "rejeitado";
    }
    return summary;
  }
  return null;
}

// ---- Persistência ----
export function getIdByChave(chave) {
  const row = db.prepare("SELECT id FROM documents WHERE chave = ?").get(chave);
  return row?.id || null;
}

export function saveDocument({ xmlText, kind, source = "upload", fileName = null }) {
  const parsed = parseXml(xmlText);
  if (!parsed) return { ok: false, error: "XML invalido" };

  const detectedKind = kind || detectKind(parsed);
  if (detectedKind === "OUTROS") {
    return { ok: false, error: "Documento nao parece ser NF-e ou CT-e" };
  }

  const summary = extractSummary(parsed);
  if (!summary) return { ok: false, error: "Nao foi possivel extrair dados do XML" };

  // Destrincha o XML completo em um objeto plano, persistido em xml_data
  const fullData = extractFullXmlData(parsed);

  const chave = extractChave(parsed);
  if (!chave || chave.length !== 44) {
    return { ok: false, error: "Chave de acesso invalida ou ausente" };
  }

  const modelo = getModelo(parsed);
  fs.mkdirSync(XML_DIR, { recursive: true });
  const safeFileName = `${chave}-${Date.now()}.xml`;
  const xmlPath = path.join(XML_DIR, safeFileName);
  fs.writeFileSync(xmlPath, xmlText, "utf-8");

  const stmt = db.prepare(`
    INSERT INTO documents (
      kind, modelo, chave, numero, serie, data_emissao,
      uf_emitente, uf_destino,
      remetente_nome, remetente_doc, destinatario_nome, destinatario_doc,
      valor_total, status, protocolo,
      xml_path, xml_size, source, updated_at, xml_data
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, datetime('now'), ?
    )
    ON CONFLICT(chave) DO UPDATE SET
      numero = excluded.numero,
      serie = excluded.serie,
      data_emissao = excluded.data_emissao,
      uf_emitente = excluded.uf_emitente,
      uf_destino = excluded.uf_destino,
      remetente_nome = excluded.remetente_nome,
      remetente_doc = excluded.remetente_doc,
      destinatario_nome = excluded.destinatario_nome,
      destinatario_doc = excluded.destinatario_doc,
      valor_total = excluded.valor_total,
      status = excluded.status,
      protocolo = excluded.protocolo,
      xml_path = excluded.xml_path,
      xml_size = excluded.xml_size,
      source = excluded.source,
      updated_at = datetime('now'),
      xml_data = excluded.xml_data
  `);

  const info = stmt.run(
    detectedKind,
    modelo ?? null,
    chave,
    summary.numero ?? null,
    summary.serie ?? null,
    summary.dataEmissao ?? null,
    summary.ufEmitente ?? null,
    summary.ufDestino ?? null,
    summary.remetenteNome ?? null,
    summary.remetenteDoc ?? null,
    summary.destinatarioNome ?? null,
    summary.destinatarioDoc ?? null,
    summary.valorTotal ?? null,
    summary.status ?? "pendente",
    summary.protocolo ?? null,
    safeFileName,
    Buffer.byteLength(xmlText, "utf-8"),
    source,
    JSON.stringify(fullData),
  );

  return {
    ok: true,
    id: Number(info.lastInsertRowid) || getIdByChave(chave),
    kind: detectedKind,
    modelo,
    chave,
    fileName: fileName || safeFileName,
    summary,
  };
}

// ---- Geração de XML a partir de JSON (sem assinatura) ----
function buildNFeFromJson(input) {
  const now = new Date().toISOString();
  const ide = {
    cUF: input.cUF || "35",
    cNF: String(Math.floor(Math.random() * 99999999)).padStart(8, "0"),
    natOp: input.natOp || "VENDA",
    serie: String(input.serie || "1"),
    nNF: String(input.numero || Math.floor(Math.random() * 999999)),
    dhEmi: input.dataEmissao || now,
    tpNF: input.tpNF || "1",
    idDest: input.idDest || "1",
    cMunFG: input.cMunFG || "3550308",
    tpImp: "1",
    tpEmis: "1",
    cDV: "0",
    tpAmb: input.tpAmb || "2",
    finNFe: input.finNFe || "1",
    indFinal: input.indFinal || "0",
    indPres: input.indPres || "9",
    procEmi: "0",
    verProc: "ConsultaNfeCTe-1.0",
  };

  const cUF = ide.cUF;
  const dh = ide.dhEmi.replace(/[-:T]/g, "").slice(0, 14);
  const serie = ide.serie.padStart(3, "0");
  const nNF = ide.nNF.padStart(9, "0");
  const tpEmis = ide.tpEmis.padStart(1, "0");
  const cNF = ide.cNF;
  const cDVPlaceholder = "0";
  let chave43 = `${cUF}${dh}${serie}${nNF}${tpEmis}${cNF}${cDVPlaceholder}`;
  chave43 = chave43.padEnd(43, "0").slice(0, 43);
  const digits = chave43.split("").map(Number);
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += digits[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  const chave44 = `${chave43.slice(0, 43)}${dv}`;
  ide.cDV = String(dv);

  const emit = {
    CNPJ: input.emit?.CNPJ, CPF: input.emit?.CPF,
    xNome: input.emit?.xNome, IE: input.emit?.IE,
    enderEmit: {
      xLgr: input.emit?.enderEmit?.xLgr, nro: input.emit?.enderEmit?.nro,
      xBairro: input.emit?.enderEmit?.xBairro, cMun: input.emit?.enderEmit?.cMun,
      xMun: input.emit?.enderEmit?.xMun, UF: input.emit?.enderEmit?.UF,
      CEP: input.emit?.enderEmit?.CEP, cPais: "1058", xPais: "BRASIL",
    },
  };

  const dest = input.dest ? {
    CNPJ: input.dest?.CNPJ, CPF: input.dest?.CPF,
    xNome: input.dest?.xNome, indIEDest: input.dest?.indIEDest || "9",
    enderDest: {
      xLgr: input.dest?.enderDest?.xLgr, nro: input.dest?.enderDest?.nro,
      xBairro: input.dest?.enderDest?.xBairro, cMun: input.dest?.enderDest?.cMun,
      xMun: input.dest?.enderDest?.xMun, UF: input.dest?.enderDest?.UF,
      CEP: input.dest?.enderDest?.CEP, cPais: "1058", xPais: "BRASIL",
    },
  } : undefined;

  const det = (input.itens || []).map((it, idx) => ({
    "@_nItem": String(idx + 1),
    prod: {
      cProd: it.cProd, xProd: it.xProd, NCM: it.NCM, CFOP: it.CFOP,
      uCom: it.uCom, qCom: it.qCom, vUnCom: it.vUnCom, vProd: it.vProd,
      cEANTrib: it.cEANTrib || it.cEAN || "",
      uTrib: it.uTrib || it.uCom, qTrib: it.qTrib || it.qCom,
      vUnTrib: it.vUnTrib || it.vUnCom, indTot: it.indTot || "1",
    },
    imposto: it.imposto || { ICMS: { ICMSSN102: { orig: "0", CSOSN: "102" } } },
  }));

  const total = {
    ICMSTot: {
      vBC: input.total?.vBC || "0.00", vICMS: input.total?.vICMS || "0.00",
      vICMSDeson: "0.00", vFCP: "0.00", vBCST: "0.00", vST: "0.00",
      vFCPST: "0.00", vFCPSTRet: "0.00",
      vProd: input.total?.vProd || "0.00", vFrete: input.total?.vFrete || "0.00",
      vSeg: input.total?.vSeg || "0.00", vDesc: input.total?.vDesc || "0.00",
      vII: "0.00", vIPI: input.total?.vIPI || "0.00", vIPIDevol: "0.00",
      vPIS: input.total?.vPIS || "0.00", vCOFINS: input.total?.vCOFINS || "0.00",
      vOutro: input.total?.vOutro || "0.00", vNF: input.total?.vNF || "0.00",
      vTotTrib: "0.00",
    },
  };

  const infNFe = { "@_Id": `NFe${chave44}`, "@_versao": "4.00", ide, emit, dest, det, total };
  const nfe = { "@_xmlns": "http://www.portalfiscal.inf.br/nfe", infNFe };
  return { nfe, chave: chave44 };
}

function buildCTeFromJson(input) {
  const now = new Date().toISOString();
  const ide = {
    cUF: input.cUF || "35",
    cCT: String(Math.floor(Math.random() * 99999999)).padStart(8, "0"),
    CFOP: input.CFOP || "6353",
    natOp: input.natOp || "TRANSPORTE RODOVIARIO",
    serie: String(input.serie || "700"),
    nCT: String(input.numero || Math.floor(Math.random() * 999999)),
    dhEmi: input.dataEmissao || now,
    tpImp: "1", tpCTe: "0", tpServ: "0",
    modal: input.modal || "1",
    UFIni: input.ufIni, UFFim: input.ufFim,
    xMunIni: input.xMunIni, xMunFim: input.xMunFim,
    tpAmb: input.tpAmb || "2", tpEmis: "1", cDV: "0",
    procEmi: "0", verProc: "ConsultaNfeCTe-1.0",
  };

  const cUF = ide.cUF;
  const dh = ide.dhEmi.replace(/[-:T]/g, "").slice(0, 14);
  const serie = ide.serie.padStart(3, "0");
  const nCT = ide.nCT.padStart(9, "0");
  const tpEmis = ide.tpEmis.padStart(1, "0");
  const cCT = ide.cCT;
  let chave43 = `${cUF}${dh}${serie}${nCT}${tpEmis}${cCT}0`;
  chave43 = chave43.padEnd(43, "0").slice(0, 43);
  const digits = chave43.split("").map(Number);
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += digits[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  const chave44 = `${chave43.slice(0, 43)}${dv}`;
  ide.cDV = String(dv);

  const emit = {
    CNPJ: input.emit?.CNPJ, xNome: input.emit?.xNome, IE: input.emit?.IE,
    xLgr: input.emit?.enderEmit?.xLgr, nro: input.emit?.enderEmit?.nro,
    xBairro: input.emit?.enderEmit?.xBairro, cMun: input.emit?.enderEmit?.cMun,
    xMun: input.emit?.enderEmit?.xMun, UF: input.emit?.enderEmit?.UF, CEP: input.emit?.enderEmit?.CEP,
  };
  const rem = {
    CNPJ: input.rem?.CNPJ || input.rem?.CPF, CPF: input.rem?.CPF,
    xNome: input.rem?.xNome, IE: input.rem?.IE,
    xLgr: input.rem?.enderReme?.xLgr, nro: input.rem?.enderReme?.nro,
    xBairro: input.rem?.enderReme?.xBairro, cMun: input.rem?.enderReme?.cMun,
    xMun: input.rem?.enderReme?.xMun, UF: input.rem?.enderReme?.UF, CEP: input.rem?.enderReme?.CEP,
  };
  const dest = {
    CNPJ: input.dest?.CNPJ || input.dest?.CPF, CPF: input.dest?.CPF,
    xNome: input.dest?.xNome, IE: input.dest?.IE,
    xLgr: input.dest?.enderDest?.xLgr, nro: input.dest?.enderDest?.nro,
    xBairro: input.dest?.enderDest?.xBairro, cMun: input.dest?.enderDest?.cMun,
    xMun: input.dest?.enderDest?.xMun, UF: input.dest?.enderDest?.UF, CEP: input.dest?.enderDest?.CEP,
  };

  const vPrest = {
    vTPrest: input.vPrest?.vTPrest || "0.00",
    vRec: input.vPrest?.vRec || input.vPrest?.vTPrest || "0.00",
    Comp: input.vPrest?.componentes || [],
  };
  const imp = {
    ICMS: {
      ICMSSN: { CST: "90", indSN: "1" },
      ICMS00: input.imposto === "proprio" ? { CST: "00", vBC: "0.00", pICMS: "0.00", vICMS: "0.00" } : undefined,
    },
  };

  const infCte = { "@_Id": `CTe${chave44}`, "@_versao": "4.00", ide, emit, rem, dest, vPrest, imp };
  const cte = { "@_xmlns": "http://www.portalfiscal.inf.br/cte", infCte };
  return { cte, chave: chave44 };
}

export function generateNFe(input) {
  const { nfe, chave } = buildNFeFromJson(input);
  const xml = xmlBuilder.build({ NFe: nfe });
  return { chave, xml };
}
export function generateCTe(input) {
  const { cte, chave } = buildCTeFromJson(input);
  const xml = xmlBuilder.build({ CTe: cte });
  return { chave, xml };
}

// ---- Busca do XML em disco ----
export function getXmlPathByRow(row) {
  return path.join(XML_DIR, row.xml_path);
}
export const XML_DIR_PATH = XML_DIR;
