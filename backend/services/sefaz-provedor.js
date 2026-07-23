// =============================================================================
//  Consulta de NF-e via provedor pago de terceiros (ex.: Infosimples)
//  -----------------------------------------------------------------------------
//  Ver aviso completo sobre limites e formato de resposta em
//  https://infosimples.com/consultas/sefaz-nfe/ — essa API devolve dados
//  estruturados + um link do XML (campo url_xml), NAO um PDF/DANFE pronto.
//  Por isso o fluxo aqui e: consulta -> baixa o XML do link -> o PDF e
//  gerado localmente (ou via MeuDANFe) a partir desse XML.
//
//  Como e um servico pago de terceiros, o endpoint/parametros sao
//  configuraveis (nao ha garantia de que o padrao abaixo sirva para a sua
//  conta — ajuste conforme o painel logado da Infosimples).
// =============================================================================
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const DEFAULT_CONFIG = {
  token: "",
  endpoint: "https://api.infosimples.com/api/v2/consultas/sefaz/nfe",
  chaveParam: "chave_acesso",
  timeout: 300,
};

const CONFIG_PATH_FACTORY = (dataDir) => path.join(dataDir, "sefaz-provedor.config.json");

export function loadConfig(dataDir) {
  try {
    const raw = fs.readFileSync(CONFIG_PATH_FACTORY(dataDir), "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}
export function saveConfig(dataDir, partial) {
  const next = { ...loadConfig(dataDir), ...partial };
  fs.writeFileSync(CONFIG_PATH_FACTORY(dataDir), JSON.stringify(next, null, 2), "utf-8");
  return next;
}
export function maskConfig(cfg) {
  return {
    ...cfg,
    tokenConfigured: Boolean(cfg.token),
    token: cfg.token ? `${cfg.token.slice(0, 4)}${"•".repeat(Math.max(0, cfg.token.length - 8))}${cfg.token.slice(-4)}` : "",
  };
}

function request(urlStr, { method = "GET", headers = {}, body = null, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error("URL invalida: " + urlStr));
    }
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? Buffer.from(body, "utf-8") : null;
    const req = lib.request(
      u,
      {
        method,
        timeout: timeoutMs,
        headers: { Accept: "application/json", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}), ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout ao contatar o provedor")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export async function consultarChave(cfg, chave) {
  if (!cfg.token) throw new Error("Token do provedor nao configurado.");
  const body = new URLSearchParams();
  body.set("token", cfg.token);
  body.set("timeout", String(cfg.timeout || 300));
  body.set(cfg.chaveParam || "chave_acesso", chave);

  const res = await request(cfg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Provedor respondeu ${res.status}: ${res.body.toString("utf-8").slice(0, 300)}`);
  }
  let json;
  try {
    json = JSON.parse(res.body.toString("utf-8"));
  } catch (e) {
    throw new Error("Resposta do provedor nao e um JSON valido.");
  }
  if (json.code && json.code !== 200) {
    const msg = (json.errors && json.errors.join("; ")) || json.code_message || `codigo ${json.code}`;
    throw new Error(`Provedor: ${msg}`);
  }
  const data = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!data) throw new Error("Provedor nao retornou dados para essa chave.");
  return data;
}

export async function baixarXmlDaConsulta(dados) {
  const url = dados.url_xml || dados.urlXml;
  if (!url) throw new Error("A resposta do provedor nao trouxe um link de XML (campo url_xml) para essa nota.");
  const res = await request(url);
  if (res.status < 200 || res.status >= 300) throw new Error(`Falha ao baixar o XML (${res.status}).`);
  return res.body.toString("utf-8");
}

export async function chaveParaXml(cfg, chave) {
  const dados = await consultarChave(cfg, chave);
  const xml = await baixarXmlDaConsulta(dados);
  return xml;
}
