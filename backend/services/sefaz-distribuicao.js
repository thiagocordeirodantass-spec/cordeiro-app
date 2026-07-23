// =============================================================================
//  Integracao DIRETA com a SEFAZ via certificado digital A1 (.pfx)
//  -----------------------------------------------------------------------------
//  Usa o webservice NFeDistribuicaoDFe do Ambiente Nacional (SVAN/SVRS), que
//  permite consultar/baixar o XML de uma NF-e/CT-e a partir da chave de
//  acesso, autenticando com o CERTIFICADO DIGITAL A1 da empresa (mesma forma
//  que o Portal Nacional e emissores homologados usam) — SEM precisar de
//  nenhum servico de terceiros.
//
//  Como funciona (autenticacao "mTLS"):
//    O certificado A1 (.pfx) e usado diretamente na conexao HTTPS (TLS mutuo)
//    com a SEFAZ, usando os proprios modulos nativos do Node (https + tls),
//    sem nenhuma biblioteca externa. O corpo da requisicao SOAP em si NAO
//    precisa de assinatura XML adicional para este servico especifico — a
//    autenticacao e feita pelo certificado apresentado na camada TLS.
//
//  IMPORTANTE — leia antes de usar:
//    Este modulo foi implementado com base no "Manual de Integracao
//    NFeDistribuicaoDFe" da SEFAZ, mas NAO PODE ser testado contra o
//    ambiente real da SEFAZ a partir deste pacote (exige certificado digital
//    valido e liberacao de rede que nao estao disponiveis aqui). Os
//    endpoints/SOAPAction abaixo sao os historicamente publicados para o
//    Ambiente Nacional — se a SEFAZ tiver atualizado a URL ou o schema,
//    ajuste as constantes abaixo ou use os campos de "endpoint customizado"
//    na interface. Em caso de erro, a resposta bruta do SOAP e devolvida
//    para facilitar o diagnostico.
//
//  Requisitos para usar de verdade:
//    - Certificado digital A1 (.pfx) valido, da empresa que ira consultar
//    - Senha do certificado
//    - CNPJ da empresa (deve corresponder ao certificado)
//    - Estar cadastrado/habilitado para NF-e (o certificado deve ser
//      reconhecido pela SEFAZ como emitente/destinatario dos documentos)
// =============================================================================
import https from "https";
import zlib from "zlib";

// Endpoints historicos do Ambiente Nacional (SVAN). Ajustaveis via UI.
export const ENDPOINTS_PADRAO = {
  producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};
const SOAP_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

// Codigos de UF (para cUFAutor), usados no corpo da requisicao
const CODIGOS_UF = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

function xmlEscape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSoapEnvelope({ tpAmb, cUFAutor, cnpjOuCpf, consultaXml }) {
  const docTag = String(cnpjOuCpf).replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF";
  const distDFeInt = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${cUFAutor}</cUFAutor>` +
    `<${docTag}>${xmlEscape(String(cnpjOuCpf).replace(/\D/g, ""))}</${docTag}>` +
    consultaXml +
    `</distDFeInt>`;

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>${distDFeInt}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function httpsPostComCertificado({ url, body, pfx, passphrase, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error("URL do endpoint SEFAZ invalida: " + url));
    }
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        pfx, // certificado A1 (Buffer do arquivo .pfx)
        passphrase, // senha do certificado
        // A SEFAZ costuma usar cadeia propria; nao validamos o CA do lado do
        // cliente aqui (comportamento equivalente ao de emissores comuns).
        rejectUnauthorized: false,
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "Content-Length": bodyBuf.length,
          SOAPAction: SOAP_ACTION,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf-8") }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout ao contatar a SEFAZ")));
    req.on("error", (e) => {
      if (e.code === "EPROTO" || /handshake|certificate/i.test(e.message)) {
        reject(new Error(
          `Falha na conexao TLS com a SEFAZ (certificado invalido, senha incorreta, ou o endpoint mudou): ${e.message}`
        ));
      } else {
        reject(e);
      }
    });
    req.write(bodyBuf);
    req.end();
  });
}

// Extrai um valor de tag simples do XML de resposta (parsing leve, sem
// dependencia externa — a resposta e sempre um XML plano e previsivel)
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}
function extractDocZip(xml) {
  const m = xml.match(/<docZip[^>]*>([\s\S]*?)<\/docZip>/);
  return m ? m[1].trim() : null;
}

// Extrai TODOS os valores de uma tag simples do XML de resposta (pode haver
// varios <docZip> num unico lote)
function extractAllTags(xml, tag) {
  const re = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push({ attrs: m[1], value: m[2].trim() });
  return out;
}

function descompactarDocZip(base64) {
  const gzipBuf = Buffer.from(base64, "base64");
  return zlib.gunzipSync(gzipBuf).toString("utf-8");
}

// Consulta uma unica chave via NFeDistribuicaoDFe. Retorna o XML original
// (procNFe/procCTe) descompactado, ou lanca erro com a mensagem da SEFAZ.
export async function consultarChaveComCertificado({
  pfx, passphrase, uf, ambiente = "producao", cnpjOuCpf, chave, endpointOverride,
}) {
  const cUFAutor = CODIGOS_UF[String(uf || "").toUpperCase()];
  if (!cUFAutor) throw new Error(`UF "${uf}" invalida ou nao informada (use a sigla, ex.: SP)`);
  const tpAmb = ambiente === "homologacao" ? "2" : "1";
  const endpoint = endpointOverride || ENDPOINTS_PADRAO[ambiente] || ENDPOINTS_PADRAO.producao;

  const consultaXml = `<consChNFe><chNFe>${xmlEscape(chave)}</chNFe></consChNFe>`;
  const soapBody = buildSoapEnvelope({ tpAmb, cUFAutor, cnpjOuCpf, consultaXml });

  let res;
  try {
    res = await httpsPostComCertificado({ url: endpoint, body: soapBody, pfx, passphrase });
  } catch (e) {
    if (/mac verify failure|bad decrypt|wrong password|invalid password/i.test(e.message)) {
      throw new Error("Senha do certificado incorreta (ou o arquivo não é um .pfx/.p12 válido).");
    }
    throw new Error(`Erro de conexao com a SEFAZ: ${e.message}`);
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`SEFAZ respondeu HTTP ${res.status}. Corpo bruto: ${res.body.slice(0, 500)}`);
  }

  const cStat = extractTag(res.body, "cStat");
  const xMotivo = extractTag(res.body, "xMotivo");

  if (cStat === "137") {
    throw new Error(`SEFAZ: nenhum documento localizado para essa chave (cStat 137 — ${xMotivo || "sem detalhes"}).`);
  }
  if (cStat && cStat !== "138") {
    throw new Error(`SEFAZ retornou cStat ${cStat}: ${xMotivo || "sem detalhes"}. Resposta bruta: ${res.body.slice(0, 500)}`);
  }

  const docZipB64 = extractDocZip(res.body);
  if (!docZipB64) {
    throw new Error(
      `SEFAZ respondeu sem erro (cStat ${cStat || "?"}), mas nao trouxe o conteudo do documento (docZip). ` +
      `Resposta bruta para diagnostico: ${res.body.slice(0, 800)}`
    );
  }

  try {
    return descompactarDocZip(docZipB64);
  } catch (e) {
    throw new Error("Falha ao descompactar o documento retornado pela SEFAZ: " + e.message);
  }
}

// Consulta um lote de documentos a partir de um NSU (Numero Sequencial Unico).
// Usado para "andar" por todo o historico disponivel na distribuicao, em vez
// de precisar saber a chave de cada documento de antemao. Retorna varios
// documentos por chamada (a SEFAZ pagina internamente, tipicamente ate ~50).
export async function consultarNsuComCertificado({
  pfx, passphrase, uf, ambiente = "producao", cnpjOuCpf, ultNSU = "0", endpointOverride,
}) {
  const cUFAutor = CODIGOS_UF[String(uf || "").toUpperCase()];
  if (!cUFAutor) throw new Error(`UF "${uf}" invalida ou nao informada (use a sigla, ex.: SP)`);
  const tpAmb = ambiente === "homologacao" ? "2" : "1";
  const endpoint = endpointOverride || ENDPOINTS_PADRAO[ambiente] || ENDPOINTS_PADRAO.producao;
  const nsuFormatado = String(ultNSU).replace(/\D/g, "").padStart(15, "0").slice(-15);

  const consultaXml = `<distNSU><ultNSU>${nsuFormatado}</ultNSU></distNSU>`;
  const soapBody = buildSoapEnvelope({ tpAmb, cUFAutor, cnpjOuCpf, consultaXml });

  let res;
  try {
    res = await httpsPostComCertificado({ url: endpoint, body: soapBody, pfx, passphrase });
  } catch (e) {
    if (/mac verify failure|bad decrypt|wrong password|invalid password/i.test(e.message)) {
      throw new Error("Senha do certificado incorreta (ou o arquivo não é um .pfx/.p12 válido).");
    }
    throw new Error(`Erro de conexao com a SEFAZ: ${e.message}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`SEFAZ respondeu HTTP ${res.status}. Corpo bruto: ${res.body.slice(0, 500)}`);
  }

  const cStat = extractTag(res.body, "cStat");
  const xMotivo = extractTag(res.body, "xMotivo");
  const ultNSUResp = extractTag(res.body, "ultNSU");
  const maxNSUResp = extractTag(res.body, "maxNSU");

  if (cStat === "137") {
    // Nenhum documento novo (fim do historico disponivel) — nao e erro, so nao ha mais nada
    return { docs: [], ultNSU: ultNSUResp || nsuFormatado, maxNSU: maxNSUResp || nsuFormatado, cStat, xMotivo };
  }
  if (cStat && cStat !== "138") {
    throw new Error(`SEFAZ retornou cStat ${cStat}: ${xMotivo || "sem detalhes"}. Resposta bruta: ${res.body.slice(0, 500)}`);
  }

  const docZips = extractAllTags(res.body, "docZip");
  const docs = [];
  for (const dz of docZips) {
    const nsuMatch = dz.attrs.match(/NSU="(\d+)"/);
    const schemaMatch = dz.attrs.match(/schema="([^"]+)"/);
    try {
      docs.push({ nsu: nsuMatch ? nsuMatch[1] : null, schema: schemaMatch ? schemaMatch[1] : null, xml: descompactarDocZip(dz.value) });
    } catch (e) {
      // pula documento que nao pode ser descompactado, mas nao interrompe o lote
    }
  }
  return { docs, ultNSU: ultNSUResp || nsuFormatado, maxNSU: maxNSUResp || nsuFormatado, cStat, xMotivo };
}

// Varre todo o historico disponivel via NSU, filtrando por data de emissao,
// para buscar TODOS os documentos de um periodo sem precisar saber as chaves
// de antemao (equivalente ao "baixar por periodo" da extensao de referencia).
// IMPORTANTE: por seguranca e tempo de resposta, ha um limite de iteracoes
// (maxIteracoes) — se o historico for muito grande, pode nao trazer tudo numa
// unica chamada; rode de novo (usando o ultNSU retornado) para continuar.
export async function consultarPeriodoComCertificado({
  pfx, passphrase, uf, ambiente = "producao", cnpjOuCpf, dateFrom, dateTo,
  endpointOverride, ultNSUInicial = "0", maxIteracoes = 30, onProgress,
}) {
  let ultNSU = ultNSUInicial;
  let maxNSU = "0";
  const encontrados = [];
  let iteracoes = 0;
  let atingiuFim = false;

  while (iteracoes < maxIteracoes) {
    iteracoes++;
    const resultado = await consultarNsuComCertificado({ pfx, passphrase, uf, ambiente, cnpjOuCpf, ultNSU, endpointOverride });
    if (onProgress) {
      onProgress({ iteracao: iteracoes, ultNSU: resultado.ultNSU, maxNSU: resultado.maxNSU, encontrados: encontrados.length + resultado.docs.length });
    }

    for (const doc of resultado.docs) {
      // Filtra por data de emissao (dhEmi), quando presente no XML (resNFe/resEvento/procNFe/procCTe)
      const dhEmiMatch = doc.xml.match(/<dhEmi>([^<]+)<\/dhEmi>/);
      const dataEmissao = dhEmiMatch ? dhEmiMatch[1].slice(0, 10) : null;
      if (dateFrom && dataEmissao && dataEmissao < dateFrom) continue;
      if (dateTo && dataEmissao && dataEmissao > dateTo) continue;
      encontrados.push(doc);
    }

    if (resultado.ultNSU === ultNSU || resultado.ultNSU === resultado.maxNSU) {
      atingiuFim = true;
      ultNSU = resultado.ultNSU;
      maxNSU = resultado.maxNSU;
      break;
    }
    ultNSU = resultado.ultNSU;
    maxNSU = resultado.maxNSU;
  }

  return { docs: encontrados, ultNSU, maxNSU, atingiuFim, iteracoes };
}
