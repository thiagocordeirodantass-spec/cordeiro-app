// =============================================================================
//  Integracao com a API do MeuDANFe (https://meudanfe.com.br)
//  -----------------------------------------------------------------------------
//  IMPORTANTE - leia antes de usar:
//  O MeuDANFe NAO publica documentacao publica da API v2 (busca por chave de
//  acesso). Cada conta pode ter endpoints ligeiramente diferentes. Por isso o
//  sistema testa, em ordem, varios endpoints provaveis e usa o PRIMEIRO que
//  responder com sucesso. O usuario tambem pode COLAR o endpoint exato da sua
//  area logada no card "Configuracao da API" e ele passa a ser o primeiro a
//  ser testado.
//
//  Endpoints PUBLICOS e gratuitos (nao exigem Api-Key):
//    POST https://ws.meudanfe.com/api/v1/get/nfe/xmltodanfepdf/API   (XML->PDF)
//
//  Endpoints de BUSCA por chave (exigem Api-Key da conta do usuario):
//    GET  https://ws.meudanfe.com/api/v1/get/nfe/{chave}/xml/API          [v1 antiga]
//    GET  https://api.meudanfe.com.br/v2/nfe/{chave}                      [v2 novo]
//    GET  https://api.meudanfe.com.br/v2/nfe/{chave}/xml                  [v2 variante]
//    POST https://api.meudanfe.com.br/v2/nfe/busca_chave  body={"chave":""}[v2 variante]
//
//  O sistema tenta cada um deles em ordem, com ambos os headers:
//    "Api-Key: <key>"  e  "Authorization: ApiKey <key>"
//  e usa o primeiro que devolver status 200 com conteudo valido (XML ou JSON com XML).
// =============================================================================
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";

const CONFIG_PATH_FACTORY = (dataDir) => path.join(dataDir, "meudanfe.config.json");

const DEFAULT_CONFIG = {
  // Api-Key chumbada (Area do Cliente > API/Integracao)
  apiKey: "30c04cfc-5193-49a3-88f9-98ba612d9bfb",
  // Endpoint publico e gratuito de conversao XML -> DANFE/DACTE PDF (nao exige Api-Key)
  xmlToPdfUrl: "https://ws.meudanfe.com/api/v1/get/nfe/xmltodanfepdf/API",
  // Endpoint customizado para busca por chave. Se preenchido, sera o PRIMEIRO testado.
  // Use {chave} como marcador da chave de 44 digitos. Ex:
  //   https://api.meudanfe.com.br/v2/nfe/{chave}/xml
  customChaveUrl: "",
  customChaveMethod: "GET",
  // Headers extras (json) - util para o usuario customizar sem mexer no codigo.
  // Ex: {"Authorization":"ApiKey MINHA_KEY"} -> substitui o header padrao.
  customHeaders: "",
  // Timeout por tentativa (ms)
  timeoutMs: 20000,
};

// ---- Cliente HTTP generico (sem dependencias externas) ----
function request(urlStr, { method = "GET", headers = {}, body = null, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); }
    catch (e) { return reject(new Error("URL invalida: " + urlStr)); }
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? (Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8")) : null;
    const req = lib.request(
      u,
      {
        method,
        timeout: timeoutMs,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
          Accept: "*/*",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout ao contatar MeuDANFe")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---- Parser: tenta extrair XML valido de uma resposta (XML puro, JSON com campo, base64) ----
function extractXmlText(resBody) {
  const text = resBody.toString("utf-8").trim();
  if (!text) return null;
  if (text.startsWith("<")) return text; // XML puro
  // Tenta JSON
  try {
    const obj = JSON.parse(text);
    if (typeof obj === "string") return obj;
    if (obj && typeof obj === "object") {
      const candidate = obj.xml || obj.data || obj.arquivo || obj.nfe?.xml || obj.resultado?.xml || obj.body;
      if (typeof candidate === "string") {
        if (candidate.startsWith("<")) return candidate;
        // Pode estar em base64
        try {
          const buf = Buffer.from(candidate, "base64");
          const dec = buf.toString("utf-8");
          if (dec.includes("<")) return dec;
        } catch (e) {}
      }
    }
  } catch (e) { /* nao era JSON */ }
  return null;
}

// Tenta interpretar a resposta como PDF binario OU como texto contendo base64/data-URI
function extractPdfBuffer(resBody, contentType = "") {
  if (contentType.includes("application/pdf")) return resBody;
  if (resBody.slice(0, 5).toString("latin1") === "%PDF-") return resBody;

  const asText = resBody.toString("utf-8").trim();
  let candidate = asText.replace(/^"(.*)"$/s, "$1");
  const dataUriMatch = candidate.match(/^data:application\/pdf;base64,(.*)$/s);
  if (dataUriMatch) candidate = dataUriMatch[1];
  try {
    const maybe = JSON.parse(asText);
    if (typeof maybe === "string") candidate = maybe;
    else if (maybe && typeof maybe === "object") {
      candidate = maybe.pdf || maybe.data || maybe.base64 || maybe.arquivo || candidate;
    }
  } catch (e) {}
  try {
    const buf = Buffer.from(candidate, "base64");
    if (buf.slice(0, 5).toString("latin1") === "%PDF-") return buf;
  } catch (e) {}
  return null;
}

// ---- Config ----
export function loadConfig(dataDir) {
  const p = CONFIG_PATH_FACTORY(dataDir);
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(dataDir, partial) {
  const p = CONFIG_PATH_FACTORY(dataDir);
  const current = loadConfig(dataDir);
  const next = { ...current, ...partial };
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function maskConfig(cfg) {
  return {
    ...cfg,
    apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}${"•".repeat(Math.max(0, cfg.apiKey.length - 8))}${cfg.apiKey.slice(-4)}` : "",
    apiKeyConfigured: Boolean(cfg.apiKey),
  };
}

// ---- Converte XML em DANFE/DACTE PDF (endpoint publico) ----
export async function xmlParaDanfePdf(cfg, xmlText) {
  const res = await request(cfg.xmlToPdfUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      ...(cfg.apiKey ? { "Api-Key": cfg.apiKey } : {}),
    },
    body: xmlText,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`MeuDANFe (XML->PDF) respondeu ${res.status}: ${res.body.toString("utf-8").slice(0, 300)}`);
  }
  const pdf = extractPdfBuffer(res.body, res.headers["content-type"] || "");
  if (!pdf) {
    throw new Error(
      "Nao foi possivel interpretar a resposta do MeuDANFe como PDF. Resposta bruta: " +
        res.body.toString("utf-8").slice(0, 300)
    );
  }
  return pdf;
}

// ---- Busca o XML de uma NF-e/CT-e pela chave (tenta varios endpoints) ----
export async function chaveParaXml(cfg, chave) {
  if (!cfg.apiKey) {
    throw new Error(
      "Api-Key do MeuDANFe nao configurada."
    );
  }
  const chaves44 = String(chave).replace(/\D/g, "");
  if (chaves44.length !== 44) throw new Error("Chave deve ter 44 digitos");

  // ---- Lista de tentativas, em ordem ----
  const attempts = [];
  // 0) customizado pelo usuario (se houver)
  if (cfg.customChaveUrl && cfg.customChaveUrl.includes("{chave}")) {
    attempts.push({
      label: "custom (configurado pelo usuario)",
      url: cfg.customChaveUrl.replace("{chave}", encodeURIComponent(chaves44)),
      method: (cfg.customChaveMethod || "GET").toUpperCase(),
    });
  }
  // 1) v2 novo
  attempts.push({ label: "v2 GET nfe/{chave}", url: `https://api.meudanfe.com.br/v2/nfe/${chaves44}`, method: "GET" });
  attempts.push({ label: "v2 GET nfe/{chave}/xml", url: `https://api.meudanfe.com.br/v2/nfe/${chaves44}/xml`, method: "GET" });
  // 2) v2 POST
  attempts.push({ label: "v2 POST nfe/busca_chave", url: "https://api.meudanfe.com.br/v2/nfe/busca_chave", method: "POST", body: JSON.stringify({ chave: chaves44 }) });
  // 3) v2 variantes
  attempts.push({ label: "v2 GET nfe/{chave}/json", url: `https://api.meudanfe.com.br/v2/nfe/${chaves44}/json`, method: "GET" });
  attempts.push({ label: "v2 GET nfe/xml/{chave}", url: `https://api.meudanfe.com.br/v2/nfe/xml/${chaves44}`, method: "GET" });
  // 4) v1 antiga
  attempts.push({ label: "v1 GET nfe/{chave}/xml/API", url: `https://ws.meudanfe.com/api/v1/get/nfe/${chaves44}/xml/API`, method: "GET" });
  attempts.push({ label: "v1 GET nfe/{chave}/xml", url: `https://ws.meudanfe.com/api/v1/get/nfe/${chaves44}/xml`, method: "GET" });

  // ---- Headers a testar em cada tentativa ----
  const headersBase = (cfg.customHeaders && (() => { try { return JSON.parse(cfg.customHeaders); } catch { return {}; } })()) || {};
  const headerSets = [
    { "Api-Key": cfg.apiKey, ...headersBase },
    { "Authorization": `ApiKey ${cfg.apiKey}`, ...headersBase },
    { "Authorization": `Bearer ${cfg.apiKey}`, ...headersBase },
  ];

  const erros = [];
  for (const att of attempts) {
    for (const headers of headerSets) {
      const ctype = att.body ? { "Content-Type": "application/json" } : {};
      try {
        const res = await request(att.url, {
          method: att.method,
          headers: { ...ctype, ...headers },
          body: att.body || null,
          timeoutMs: cfg.timeoutMs || 20000,
        });
        if (res.status < 200 || res.status >= 300) {
          erros.push(`[${att.label}] status ${res.status}: ${res.body.toString("utf-8").slice(0, 120)}`);
          continue;
        }
        const xml = extractXmlText(res.body);
        if (xml && xml.includes("<")) {
          // Sucesso!
          return xml;
        }
        erros.push(`[${att.label}] status 200 mas sem XML: ${res.body.toString("utf-8").slice(0, 120)}`);
      } catch (e) {
        erros.push(`[${att.label}] erro: ${e.message}`);
      }
    }
  }
  throw new Error(
    "Nenhum endpoint do MeuDANFe retornou XML para esta chave. " +
    "Voce pode colar o endpoint exato da sua area logada no card " +
    "'Configuracao da API' (campo 'Endpoint customizado de busca'). " +
    "Ultimos erros: " + erros.slice(-4).join(" | ")
  );
}
