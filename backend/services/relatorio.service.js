// =============================================================================
//  services/relatorio.service.js
//  -----------------------------------------------------------------------------
//  Centraliza:
//    - COLUNAS_DISPONIVEIS (TODOS os campos que podem ser exportados/selecionados)
//    - CAMPOS_PERMITIDOS (chaves válidas — usado por templates.service)
//    - filtrosToWhere(query) — converte query params em WHERE + params
//    - buscarDocs(query) — busca com filtros e junta xml_data parseado
//    - formatRow(d, campos) — gera linha para XLSX/CSV/PDF
//    - resumo(docs) — métricas (total, valor, etc)
// =============================================================================
import { db } from "../db/index.js";
import { formatDatePdf } from "./pdf.service.js";

// ---- Helper: tira sufixo ".0" que aparece quando o parser converteu número -> string ----
export function semSufixoZero(v) {
  if (v == null) return "";
  const s = String(v);
  return /^\d+\.0$/.test(s) ? s.slice(0, -2) : s;
}

// ---- Acesso unificado: campos do banco + campos do xml_data ----
function getField(doc, key) {
  if (doc == null) return null;
  // 1) coluna direta do banco
  if (key in doc && key !== "xml_data") return doc[key];
  // 2) campo do xml_data destrinchado
  if (doc.__xml && key in doc.__xml) return doc.__xml[key];
  return null;
}

// ---- Definição de colunas ----
// Cada coluna: { label, get(doc), width, numeric? }
// `get` recebe o doc e lê de colunas diretas OU do __xml (xml_data destrinchado)
export const COLUNAS_DISPONIVEIS = {
  // ====== Identificação básica (colunas do banco) ======
  kind: { label: "Tipo", get: (d) => (d.kind === "NFE" ? "NF-e" : d.kind === "CTE" ? "CT-e" : d.kind || ""), width: 8 },
  numero: { label: "Número", get: (d) => semSufixoZero(getField(d, "numero")), width: 10 },
  serie: { label: "Série", get: (d) => semSufixoZero(getField(d, "serie")), width: 8 },
  chave: { label: "Chave de acesso", get: (d) => d.chave || "", width: 26 },
  data_emissao: { label: "Emissão", get: (d) => formatDatePdf(getField(d, "dataEmissao") || d.data_emissao), width: 18 },
  uf_emitente: { label: "UF Emit.", get: (d) => d.uf_emitente || getField(d, "ufEmitente") || "", width: 8 },
  uf_destino: { label: "UF Dest.", get: (d) => d.uf_destino || getField(d, "ufDestino") || "", width: 8 },
  remetente_nome: { label: "Remetente", get: (d) => d.remetente_nome || "", width: 28 },
  remetente_doc: { label: "Doc. Remetente", get: (d) => semSufixoZero(d.remetente_doc), width: 18 },
  destinatario_nome: { label: "Destinatário", get: (d) => d.destinatario_nome || "", width: 28 },
  destinatario_doc: { label: "Doc. Destinatário", get: (d) => semSufixoZero(d.destinatario_doc), width: 18 },
  valor_total: { label: "Valor", get: (d) => Number(d.valor_total) || 0, numeric: true, width: 14 },
  status: { label: "Status", get: (d) => d.status || "", width: 12 },
  protocolo: { label: "Protocolo", get: (d) => semSufixoZero(d.protocolo), width: 18 },
  source: { label: "Origem", get: (d) => d.source || "", width: 10 },

  // ====== Identificação do documento (xml_data) ======
  natOp: { label: "Nat. Operação", get: (d) => getField(d, "natOp") || "", width: 26 },
  modelo: { label: "Modelo", get: (d) => d.modelo || getField(d, "mod") || "", width: 8 },
  tpNF: { label: "Tipo NF", get: (d) => getField(d, "tpNF") || "", width: 8 },
  idDest: { label: "ID Dest.", get: (d) => getField(d, "idDest") || "", width: 8 },
  cMunFG: { label: "Cód. Mun. FG", get: (d) => getField(d, "cMunFG") || "", width: 12 },
  tpEmis: { label: "Tipo Emissão", get: (d) => getField(d, "tpEmis") || "", width: 10 },
  cDV: { label: "DV Chave", get: (d) => getField(d, "cDV") || "", width: 8 },
  tpAmb: { label: "Ambiente", get: (d) => getField(d, "tpAmb") === "1" ? "Produção" : (getField(d, "tpAmb") === "2" ? "Homologação" : getField(d, "tpAmb") || ""), width: 12 },
  finNFe: { label: "Finalidade", get: (d) => ({ "1": "Normal", "2": "Complementar", "3": "Ajuste", "4": "Devolução" }[getField(d, "finNFe")] || getField(d, "finNFe") || ""), width: 14 },
  indFinal: { label: "Consumidor Final", get: (d) => getField(d, "indFinal") === "1" ? "Sim" : (getField(d, "indFinal") === "0" ? "Não" : ""), width: 14 },
  indPres: { label: "Presença", get: (d) => ({ "0": "Não se aplica", "1": "Presencial", "2": "Internet", "3": "Teleatendimento", "4": "Entrega", "5": "Presencial fora", "9": "Outros" }[getField(d, "indPres")] || ""), width: 16 },

  // ====== Emitente (xml_data) ======
  emitCNPJ: { label: "Emit. CNPJ", get: (d) => getField(d, "emitCNPJ") || "", width: 18 },
  emitCPF: { label: "Emit. CPF", get: (d) => getField(d, "emitCPF") || "", width: 14 },
  emitNome: { label: "Emit. Nome", get: (d) => getField(d, "emitNome") || "", width: 28 },
  emitFantasia: { label: "Emit. Fantasia", get: (d) => getField(d, "emitFantasia") || "", width: 28 },
  emitIE: { label: "Emit. IE", get: (d) => getField(d, "emitIE") || "", width: 14 },
  emitIEST: { label: "Emit. IEST", get: (d) => getField(d, "emitIEST") || "", width: 14 },
  emitIM: { label: "Emit. IM", get: (d) => getField(d, "emitIM") || "", width: 14 },
  emitCNAE: { label: "Emit. CNAE", get: (d) => getField(d, "emitCNAE") || "", width: 10 },
  emitCRT: { label: "Emit. CRT", get: (d) => getField(d, "emitCRT") || "", width: 8 },
  emitLogradouro: { label: "Emit. Logradouro", get: (d) => getField(d, "emitLogradouro") || "", width: 28 },
  emitNumero: { label: "Emit. Número", get: (d) => getField(d, "emitNumero") || "", width: 10 },
  emitComplemento: { label: "Emit. Compl.", get: (d) => getField(d, "emitComplemento") || "", width: 14 },
  emitBairro: { label: "Emit. Bairro", get: (d) => getField(d, "emitBairro") || "", width: 20 },
  emitCodMun: { label: "Emit. Cód. Mun.", get: (d) => getField(d, "emitCodMun") || "", width: 12 },
  emitMun: { label: "Emit. Município", get: (d) => getField(d, "emitMun") || "", width: 24 },
  emitUF: { label: "Emit. UF", get: (d) => getField(d, "emitUF") || "", width: 8 },
  emitCEP: { label: "Emit. CEP", get: (d) => getField(d, "emitCEP") || "", width: 10 },
  emitPais: { label: "Emit. País", get: (d) => getField(d, "emitPais") || "", width: 14 },
  emitFone: { label: "Emit. Fone", get: (d) => getField(d, "emitFone") || "", width: 14 },

  // ====== Destinatário (xml_data) ======
  destCNPJ: { label: "Dest. CNPJ", get: (d) => getField(d, "destCNPJ") || "", width: 18 },
  destCPF: { label: "Dest. CPF", get: (d) => getField(d, "destCPF") || "", width: 14 },
  destNome: { label: "Dest. Nome", get: (d) => getField(d, "destNome") || "", width: 28 },
  destIE: { label: "Dest. IE", get: (d) => getField(d, "destIE") || "", width: 14 },
  destEmail: { label: "Dest. Email", get: (d) => getField(d, "destEmail") || "", width: 28 },
  destLogradouro: { label: "Dest. Logradouro", get: (d) => getField(d, "destLogradouro") || "", width: 28 },
  destNumero: { label: "Dest. Número", get: (d) => getField(d, "destNumero") || "", width: 10 },
  destComplemento: { label: "Dest. Compl.", get: (d) => getField(d, "destComplemento") || "", width: 14 },
  destBairro: { label: "Dest. Bairro", get: (d) => getField(d, "destBairro") || "", width: 20 },
  destCodMun: { label: "Dest. Cód. Mun.", get: (d) => getField(d, "destCodMun") || "", width: 12 },
  destMun: { label: "Dest. Município", get: (d) => getField(d, "destMun") || "", width: 24 },
  destUF: { label: "Dest. UF", get: (d) => getField(d, "destUF") || "", width: 8 },
  destCEP: { label: "Dest. CEP", get: (d) => getField(d, "destCEP") || "", width: 10 },
  destPais: { label: "Dest. País", get: (d) => getField(d, "destPais") || "", width: 14 },
  destFone: { label: "Dest. Fone", get: (d) => getField(d, "destFone") || "", width: 14 },

  // ====== Totais (NF-e) ======
  vBC: { label: "BC ICMS", get: (d) => Number(getField(d, "vBC")) || 0, numeric: true, width: 14 },
  vICMS: { label: "v. ICMS", get: (d) => Number(getField(d, "vICMS")) || 0, numeric: true, width: 14 },
  vICMSDeson: { label: "v. ICMS Deson.", get: (d) => Number(getField(d, "vICMSDeson")) || 0, numeric: true, width: 14 },
  vFCP: { label: "v. FCP", get: (d) => Number(getField(d, "vFCP")) || 0, numeric: true, width: 14 },
  vBCST: { label: "BC ST", get: (d) => Number(getField(d, "vBCST")) || 0, numeric: true, width: 14 },
  vST: { label: "v. ST", get: (d) => Number(getField(d, "vST")) || 0, numeric: true, width: 14 },
  vProd: { label: "v. Produtos", get: (d) => Number(getField(d, "vProd")) || 0, numeric: true, width: 14 },
  vFrete: { label: "v. Frete", get: (d) => Number(getField(d, "vFrete")) || 0, numeric: true, width: 12 },
  vSeg: { label: "v. Seguro", get: (d) => Number(getField(d, "vSeg")) || 0, numeric: true, width: 12 },
  vDesc: { label: "v. Desconto", get: (d) => Number(getField(d, "vDesc")) || 0, numeric: true, width: 12 },
  vII: { label: "v. II", get: (d) => Number(getField(d, "vII")) || 0, numeric: true, width: 12 },
  vIPI: { label: "v. IPI", get: (d) => Number(getField(d, "vIPI")) || 0, numeric: true, width: 12 },
  vPIS: { label: "v. PIS", get: (d) => Number(getField(d, "vPIS")) || 0, numeric: true, width: 12 },
  vCOFINS: { label: "v. COFINS", get: (d) => Number(getField(d, "vCOFINS")) || 0, numeric: true, width: 12 },
  vOutro: { label: "v. Outros", get: (d) => Number(getField(d, "vOutro")) || 0, numeric: true, width: 12 },
  vNF: { label: "v. NF", get: (d) => Number(getField(d, "vNF")) || 0, numeric: true, width: 14 },
  vTotTrib: { label: "v. Trib.", get: (d) => Number(getField(d, "vTotTrib")) || 0, numeric: true, width: 12 },

  // ====== Transporte (NF-e) ======
  modFrete: { label: "Mod. Frete", get: (d) => ({ "0": "Por conta do emit.", "1": "Por conta do dest.", "2": "Por conta de terceiros", "3": "Própria por rem.", "4": "Própria por dest.", "9": "Sem frete" }[getField(d, "modFrete")] || getField(d, "modFrete") || ""), width: 18 },
  transportaCNPJ: { label: "Transp. CNPJ", get: (d) => getField(d, "transportaCNPJ") || "", width: 18 },
  transportaCPF: { label: "Transp. CPF", get: (d) => getField(d, "transportaCPF") || "", width: 14 },
  transportaNome: { label: "Transp. Nome", get: (d) => getField(d, "transportaNome") || "", width: 28 },
  transportaIE: { label: "Transp. IE", get: (d) => getField(d, "transportaIE") || "", width: 14 },
  transportaEndereco: { label: "Transp. Endereço", get: (d) => getField(d, "transportaEndereco") || "", width: 28 },
  transportaMun: { label: "Transp. Município", get: (d) => getField(d, "transportaMun") || "", width: 24 },
  transportaUF: { label: "Transp. UF", get: (d) => getField(d, "transportaUF") || "", width: 8 },
  veicPlaca: { label: "Veíc. Placa", get: (d) => getField(d, "veicPlaca") || "", width: 10 },
  veicUF: { label: "Veíc. UF", get: (d) => getField(d, "veicUF") || "", width: 8 },
  veicRNTC: { label: "Veíc. RNTC", get: (d) => getField(d, "veicRNTC") || "", width: 12 },
  reboquePlaca: { label: "Reboque Placa", get: (d) => getField(d, "reboquePlaca") || "", width: 10 },
  volQVol: { label: "Volumes Qtd.", get: (d) => getField(d, "volQVol") || "", width: 10 },
  volEsp: { label: "Volumes Espécie", get: (d) => getField(d, "volEsp") || "", width: 12 },
  volMarca: { label: "Volumes Marca", get: (d) => getField(d, "volMarca") || "", width: 12 },
  volPesoL: { label: "Peso Líq.", get: (d) => Number(getField(d, "volPesoL")) || 0, numeric: true, width: 10 },
  volPesoB: { label: "Peso Bruto", get: (d) => Number(getField(d, "volPesoB")) || 0, numeric: true, width: 10 },

  // ====== Cobrança (NF-e) ======
  fatNumero: { label: "Fatura Nro.", get: (d) => getField(d, "fatNumero") || "", width: 14 },
  fatValorOriginal: { label: "Fatura v. Original", get: (d) => Number(getField(d, "fatValorOriginal")) || 0, numeric: true, width: 16 },
  fatValorDesconto: { label: "Fatura Desconto", get: (d) => Number(getField(d, "fatValorDesconto")) || 0, numeric: true, width: 14 },
  fatValorLiquido: { label: "Fatura Líquido", get: (d) => Number(getField(d, "fatValorLiquido")) || 0, numeric: true, width: 14 },
  duplicatas: { label: "Duplicatas", get: (d) => getField(d, "duplicatas") || "", width: 30 },
  dupQuantidade: { label: "Qtd. Duplicatas", get: (d) => getField(d, "dupQuantidade") || 0, numeric: true, width: 10 },

  // ====== Pagamento (NF-e) ======
  pagForma: { label: "Forma Pagto.", get: (d) => getField(d, "pagForma") || "", width: 14 },
  pagValor: { label: "Valor Pago", get: (d) => Number(getField(d, "pagValor")) || 0, numeric: true, width: 14 },
  detPagFormas: { label: "Formas (detPag)", get: (d) => getField(d, "detPagFormas") || "", width: 18 },
  detPagResumo: { label: "Pagamentos", get: (d) => getField(d, "detPagResumo") || "", width: 30 },

  // ====== Itens (NF-e) ======
  itensQuantidade: { label: "Qtd. Itens", get: (d) => Number(getField(d, "itensQuantidade")) || 0, numeric: true, width: 10 },
  itensProdutos: { label: "Produtos", get: (d) => getField(d, "itensProdutos") || "", width: 40 },
  itensCFOPs: { label: "CFOPs", get: (d) => getField(d, "itensCFOPs") || "", width: 16 },
  itensNCMs: { label: "NCMs", get: (d) => getField(d, "itensNCMs") || "", width: 22 },

  // ====== CT-e específicos ======
  modal: { label: "Modal", get: (d) => getField(d, "modal") || "", width: 8 },
  modalDescricao: { label: "Modal Descrição", get: (d) => getField(d, "modalDescricao") || "", width: 18 },
  UFEnv: { label: "UF Env.", get: (d) => getField(d, "UFEnv") || "", width: 8 },
  UFIni: { label: "UF Ini.", get: (d) => getField(d, "UFIni") || "", width: 8 },
  UFFim: { label: "UF Fim", get: (d) => getField(d, "UFFim") || "", width: 8 },
  cMunIni: { label: "Cód. Mun. Ini.", get: (d) => getField(d, "cMunIni") || "", width: 12 },
  cMunFim: { label: "Cód. Mun. Fim", get: (d) => getField(d, "cMunFim") || "", width: 12 },
  xMunIni: { label: "Mun. Ini.", get: (d) => getField(d, "xMunIni") || "", width: 22 },
  xMunFim: { label: "Mun. Fim", get: (d) => getField(d, "xMunFim") || "", width: 22 },
  tpCTe: { label: "Tipo CT-e", get: (d) => ({ "0": "Normal", "1": "Complemento", "2": "Anulação", "3": "Substituição" }[getField(d, "tpCTe")] || getField(d, "tpCTe") || ""), width: 14 },
  tpServ: { label: "Tipo Serviço", get: (d) => ({ "0": "Normal", "1": "Subcontratação", "2": "Redespacho", "3": "Intermediário", "4": "Multimodal" }[getField(d, "tpServ")] || getField(d, "tpServ") || ""), width: 16 },
  toma: { label: "Tomador", get: (d) => ({ "0": "Remetente", "1": "Expedidor", "2": "Recebedor", "3": "Destinatário", "4": "Outros" }[getField(d, "toma")] || ""), width: 14 },

  // ====== Remetente CT-e ======
  remCNPJ: { label: "Rem. CNPJ", get: (d) => getField(d, "remCNPJ") || "", width: 18 },
  remCPF: { label: "Rem. CPF", get: (d) => getField(d, "remCPF") || "", width: 14 },
  remNome: { label: "Rem. Nome", get: (d) => getField(d, "remNome") || "", width: 28 },
  remIE: { label: "Rem. IE", get: (d) => getField(d, "remIE") || "", width: 14 },
  remMun: { label: "Rem. Município", get: (d) => getField(d, "remMun") || "", width: 22 },
  remUF: { label: "Rem. UF", get: (d) => getField(d, "remUF") || "", width: 8 },

  // ====== Valores e impostos CT-e ======
  vTPrest: { label: "v. Total Prest.", get: (d) => Number(getField(d, "vTPrest")) || 0, numeric: true, width: 14 },
  vRec: { label: "v. Recebido", get: (d) => Number(getField(d, "vRec")) || 0, numeric: true, width: 14 },
  componentes: { label: "Componentes", get: (d) => getField(d, "componentes") || "", width: 30 },
  impCST: { label: "CST", get: (d) => getField(d, "impCST") || "", width: 8 },
  impVBC: { label: "BC ICMS (CT-e)", get: (d) => Number(getField(d, "impVBC")) || 0, numeric: true, width: 14 },
  impPICMS: { label: "Alíq. ICMS", get: (d) => Number(getField(d, "impPICMS")) || 0, numeric: true, width: 10 },
  impVICMS: { label: "v. ICMS (CT-e)", get: (d) => Number(getField(d, "impVICMS")) || 0, numeric: true, width: 14 },
  impVTotTrib: { label: "v. Trib. (CT-e)", get: (d) => Number(getField(d, "impVTotTrib")) || 0, numeric: true, width: 14 },

  // ====== Documentos referenciados CT-e ======
  docRefChaves: { label: "NF-e Referenciadas", get: (d) => getField(d, "docRefChaves") || "", width: 40 },
  docRefNFe: { label: "Qtd. NF-e Ref.", get: (d) => Number(getField(d, "docRefNFe")) || 0, numeric: true, width: 10 },
  docRefNF: { label: "NF Referenciadas", get: (d) => getField(d, "docRefNF") || "", width: 30 },

  // ====== Seguro CT-e ======
  segResponsavel: { label: "Seg. Resp.", get: (d) => ({ "0": "Remetente", "1": "Expedidor", "2": "Recebedor", "3": "Destinatário", "4": "Emitente CT-e", "5": "Tomador" }[getField(d, "segResponsavel")] || ""), width: 14 },
  segNumeroApolice: { label: "Apólice", get: (d) => getField(d, "segNumeroApolice") || "", width: 16 },
  segNomeSeguradora: { label: "Seguradora", get: (d) => getField(d, "segNomeSeguradora") || "", width: 22 },
  segNumeroAverbacao: { label: "Averbação", get: (d) => getField(d, "segNumeroAverbacao") || "", width: 16 },
  segValor: { label: "v. Carga", get: (d) => Number(getField(d, "segValor")) || 0, numeric: true, width: 14 },

  // ====== Protocolo ======
  protAmbiente: { label: "Prot. Ambiente", get: (d) => getField(d, "protAmbiente") || "", width: 10 },
  protNumero: { label: "Prot. Número", get: (d) => getField(d, "protNumero") || "", width: 18 },
  protDataHora: { label: "Prot. Data/Hora", get: (d) => getField(d, "protDataHora") || "", width: 20 },
  protStatus: { label: "Prot. Status", get: (d) => getField(d, "protStatus") || "", width: 12 },
  protMotivo: { label: "Prot. Motivo", get: (d) => getField(d, "protMotivo") || "", width: 30 },
};

export const CAMPOS_PERMITIDOS = Object.keys(COLUNAS_DISPONIVEIS);

// ---- Conversão de query -> WHERE + params ----
export function filtrosToWhere(query) {
  const { kind, status, q, uf, dateFrom, dateTo, papel, meuCnpj } = query || {};
  const where = [];
  const params = [];
  if (kind) { where.push("kind = ?"); params.push(String(kind).toUpperCase()); }
  if (status) { where.push("status = ?"); params.push(status); }
  if (uf) { where.push("(uf_emitente = ? OR uf_destino = ?)"); params.push(uf, uf); }
  if (dateFrom) { where.push("date(data_emissao) >= date(?)"); params.push(dateFrom); }
  if (dateTo) { where.push("date(data_emissao) <= date(?)"); params.push(dateTo); }
  if (q) {
    where.push(
      "(remetente_nome LIKE ? OR destinatario_nome LIKE ? OR chave LIKE ? OR numero LIKE ? OR remetente_doc LIKE ? OR destinatario_doc LIKE ?)"
    );
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
  return { where, params };
}

export function buscarDocs(query = {}, { limit = 5000 } = {}) {
  const { where, params } = filtrosToWhere(query);
  const sql = `
    SELECT * FROM documents
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY datetime(data_emissao) DESC, id DESC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...params, Number(limit));
  // Junta xml_data parseado em cada linha, sob a chave __xml
  for (const r of rows) {
    r.__xml = {};
    if (r.xml_data) {
      try { r.__xml = JSON.parse(r.xml_data) || {}; } catch (e) { r.__xml = {}; }
    }
  }
  return rows;
}

// ---- Gera linha (array de strings) para uma lista de campos ----
export function formatRow(doc, campos) {
  return campos.map((c) => {
    const def = COLUNAS_DISPONIVEIS[c];
    if (!def) return "";
    try { return def.get(doc); } catch (e) { return ""; }
  });
}

// ---- Resumo/métricas ----
export function resumo(docs) {
  const autorizados = docs.filter((d) => d.status === "autorizado");
  const totalAutorizado = autorizados.reduce((s, d) => s + (Number(d.valor_total) || 0), 0);
  return {
    total: docs.length,
    nfe: docs.filter((d) => d.kind === "NFE").length,
    cte: docs.filter((d) => d.kind === "CTE").length,
    autorizados: autorizados.length,
    cancelados: docs.filter((d) => d.status === "cancelado").length,
    valorAutorizado: totalAutorizado,
  };
}

// ---- Serializa query -> string legível para exibir nos PDFs ----
export function filtrosToString(query) {
  const keys = ["kind", "status", "uf", "dateFrom", "dateTo", "q", "papel"];
  const parts = keys.filter((k) => query[k]).map((k) => `${k}=${query[k]}`);
  return parts.length ? parts.join("; ") : "nenhum";
}

// =============================================================================
//  TEMPLATES PRÉ-DEFINIDOS POR MÓDULO
//  -----------------------------------------------------------------------------
//  Cada módulo tem um conjunto de templates com colunas já selecionadas.
//  O usuário pode usar como ponto de partida e customizar.
// =============================================================================
export const TEMPLATES_MODULOS = {
  NFE: {
    "NFe — Resumo fiscal": ["kind", "numero", "serie", "data_emissao", "remetente_nome", "remetente_doc", "destinatario_nome", "destinatario_doc", "valor_total", "status", "natOp", "tpNF", "tpAmb"],
    "NFe — Impostos (ICMS)": ["chave", "data_emissao", "remetente_nome", "destinatario_nome", "valor_total", "vBC", "vICMS", "vICMSDeson", "vBCST", "vICMSST", "vICMSSubstituto", "pICMS", "orig", "cst", "modBC", "modBCST"],
    "NFe — Totais e frete": ["chave", "data_emissao", "remetente_nome", "destinatario_nome", "valor_total", "vProd", "vFrete", "vSeg", "vDesc", "vII", "vIPI", "vIPIDevol", "vPIS", "vCOFINS", "vOutro", "vNF"],
    "NFe — Endereços completos": ["chave", "data_emissao", "emitNome", "emitCNPJ", "emitLogradouro", "emitNumero", "emitBairro", "emitMun", "emitUF", "emitCEP", "destNome", "destCNPJ", "destLogradouro", "destNumero", "destBairro", "destMun", "destUF", "destCEP"],
    "NFe — Pagamento": ["chave", "data_emissao", "remetente_nome", "valor_total", "pagamento_tPag", "pagamento_vPag", "pagamento_tpIntegra", "pagamento_cnpj", "pagamento_bandeira", "pagamento_idTerminal"],
  },
  CTE: {
    "CTe — Resumo": ["kind", "numero", "serie", "data_emissao", "remetente_nome", "remetente_doc", "destinatario_nome", "destinatario_doc", "valor_total", "status"],
    "CTe — Transporte (modal/rota)": ["chave", "data_emissao", "remetente_nome", "destinatario_nome", "valor_total", "modal", "tipoServico", "tomador", "municipioIni", "municipioFim", "ufIni", "ufFim", "dataInicioPrestacao", "dataFimPrestacao"],
    "CTe — Carga": ["chave", "data_emissao", "remetente_nome", "valor_total", "vCarga", "proPred", "xOutCat", "infQ_carga_qCarga", "infQ_carga_tpMed"],
    "CTe — Veículo/motorista": ["chave", "data_emissao", "remetente_nome", "valor_total", "veic_placa", "veic_uf", "veic_RNTC", "veic_tpVeic", "veic_tpCar", "veic_tpRod", "motorista_nome", "motorista_cpf"],
    "CTe — Cobrança/pagamento": ["chave", "data_emissao", "remetente_nome", "valor_total", "cobr_nFat", "cobr_vOrig", "cobr_vDesc", "cobr_vLiq", "cobr_dup_nDup", "cobr_dup_dVenc", "cobr_dup_vDup"],
  },
  GERAIS: {
    "Geral — Todos documentos": ["kind", "numero", "serie", "chave", "data_emissao", "remetente_nome", "remetente_doc", "destinatario_nome", "destinatario_doc", "valor_total", "status", "source"],
    "Geral — Cancelados": ["chave", "data_emissao", "kind", "numero", "remetente_nome", "destinatario_nome", "valor_total", "status"],
    "Geral — Auditoria de impostos": ["chave", "data_emissao", "remetente_nome", "destinatario_nome", "valor_total", "vBC", "vICMS", "vIPI", "vPIS", "vCOFINS", "status"],
    "Geral — Resumo por origem": ["chave", "data_emissao", "kind", "numero", "remetente_nome", "valor_total", "source", "status"],
  },
};
