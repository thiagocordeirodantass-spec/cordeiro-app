// =============================================================================
//  routes/consulta.routes.js — consulta pública SEFAZ + validação de chave
// =============================================================================
import { Router } from "express";
import https from "https";
import http from "http";
import { validarDigitoVerificadorChave } from "../services/chave.service.js";

const router = Router();

function httpGet(url, { timeoutMs = 8000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, text/xml, text/html, */*",
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString("utf-8"),
      }));
    });
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
  });
}

async function consultarPortalNFe(chave) {
  if (!validarDigitoVerificadorChave(chave)) {
    return { ok: false, error: "Chave invalida (digito verificador modulo 11 nao confere)." };
  }
  return {
    ok: true, chave, dvValido: true,
    nota: "Sem certificado A1, a consulta automatica na SEFAZ nao e possivel. Use o QR Code da DANFE ou o link publico abaixo.",
    consultaPublicaUrl: `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&chaveAcesso=${chave}`,
    manifestacaoUrl: `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=manifestacao&chaveAcesso=${chave}`,
  };
}

async function consultarPortalCTe(chave) {
  if (!validarDigitoVerificadorChave(chave)) {
    return { ok: false, error: "Chave invalida (digito verificador modulo 11 nao confere)." };
  }
  return {
    ok: true, chave, dvValido: true,
    nota: "Sem certificado A1, a consulta automatica na SEFAZ nao e possivel para CT-e. Use o QR Code do DACTE ou o link publico abaixo.",
    consultaPublicaUrl: `https://www.cte.fazenda.gov.br/portal/consulta.aspx?tipoConsulta=resumo&chaveAcesso=${chave}`,
  };
}

router.get("/nfe/:chave", async (req, res) => {
  const chave = req.params.chave.replace(/\D/g, "");
  try { res.json(await consultarPortalNFe(chave)); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message) }); }
});

router.get("/cte/:chave", async (req, res) => {
  const chave = req.params.chave.replace(/\D/g, "");
  try { res.json(await consultarPortalCTe(chave)); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message) }); }
});

router.get("/chave/validar/:chave", (req, res) => {
  res.json({ valida: validarDigitoVerificadorChave(req.params.chave) });
});

export default router;
