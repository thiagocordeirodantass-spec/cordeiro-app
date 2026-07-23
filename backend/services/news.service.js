// =============================================================================
//  services/news.service.js — Notícias fiscais curadas + busca RSS
//  -----------------------------------------------------------------------------
//  1) Mantém uma lista CURADA de notícias-chave da Reforma Tributária e
//     mudanças tributárias (sempre disponível, mesmo offline).
//  2) Tenta complementar com manchetes de RSS públicos de portais fiscais
//     (Jornal Contábil, Sped, etc). Se não conseguir, sem erro.
// =============================================================================
import https from "https";
import http from "http";
import { URL } from "url";

// Lista curada — Reforma Tributária 2026-2033
const CURATED = [
  {
    id: "reforma-ibs-cbs-2026",
    tag: "reforma",
    tagLabel: "REFORMA TRIBUTÁRIA",
    titulo: "IBS e CBS entram em fase de testes em 2026",
    resumo: "A partir de 2026, IBS (estados/municípios) e CBS (federal) iniciam fase de testes com opcionalidade. Empresas devem validar layout, apuração e cruzamentos com o Sistema Tributário Nacional.",
    fonte: "Receita Federal",
    data: "2026-07-15",
    url: "https://www.gov.br/receitafederal/pt-br/assuntos/reforma-tributaria",
    featured: true,
  },
  {
    id: "reforma-cronograma",
    tag: "reforma",
    tagLabel: "CRONOGRAMA",
    titulo: "Cronograma oficial: extinção gradual até 2033",
    resumo: "PIS/COFINS (2027), IPI (2028), ICMS (2029), ISS e IE (2030) e fim total em 2033. O Imposto Seletivo sobre bens e serviços prejudiciais à saúde entra em 2027.",
    fonte: "EC 132/2023",
    data: "2026-07-10",
    url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm",
  },
  {
    id: "nf-e-2026-novo-leiaute",
    tag: "novo",
    tagLabel: "NF-e 4.00",
    titulo: "NF-e 4.00 entra em vigor: novos campos IBS/CBS",
    resumo: "Layout 4.00 da NF-e passa a aceitar campos IBSCBS, valor IBS e valor CBS no grupo de totais. Versão se torna obrigatória a partir de janeiro de 2027.",
    fonte: "ENCAT",
    data: "2026-07-20",
    url: "https://www.nfe.fazenda.gov.br/",
  },
  {
    id: "cte-novo-leiaute",
    tag: "novo",
    tagLabel: "CT-e 4.00",
    titulo: "CT-e 4.00 — adequação à Reforma Tributária",
    resumo: "CT-e também recebe novos campos IBS/CBS. Emissores precisam atualizar bibliotecas até o fim do ano para evitar rejeições em janeiro.",
    fonte: "ENCAT",
    data: "2026-07-18",
    url: "https://www.cte.fazenda.gov.br/",
  },
  {
    id: "alerta-icms-st",
    tag: "alerta",
    tagLabel: "ALERTA FISCAL",
    titulo: "ICMS-ST: regimes se adequam ao IVA Dual em 2029",
    resumo: "Estados publicaram protocolos de transição do ICMS-ST para IBS. Empresas com substituição tributária devem revisar estoques e regimes especiais em 2027.",
    fonte: "CONFAZ",
    data: "2026-07-12",
    url: "https://www.confaz.fazenda.gov.br/",
  },
  {
    id: "alerta-cred-outorgado",
    tag: "alerta",
    tagLabel: "ALERTA",
    titulo: "Crédito outorgado de ICMS será extinto com a reforma",
    resumo: "Diversos regimes de crédito outorgado de ICMS serão revistos ou extintos com a transição para IBS. Antecipe o planejamento tributário do seu cliente.",
    fonte: "Jornal Contábil",
    data: "2026-07-08",
    url: "https://www.jornalcontabil.com.br/",
  },
  {
    id: "novo-sped",
    tag: "novo",
    tagLabel: "SPED REFORM",
    titulo: "SPED Reforme: nova apuração IBS/CBS em 2027",
    resumo: "A apuração centralizada do IBS/CBS (SPED Reforme) será obrigatória a partir de 2027. ECD, ECF e EFD-ICMS/IPI precisarão de cruzamentos.",
    fonte: "Receita Federal",
    data: "2026-07-05",
    url: "https://www.gov.br/receitafederal/pt-br/assuntos/sped",
  },
];

// RSS feeds para tentar puxar manchetes em tempo real
const RSS_SOURCES = [
  { url: "https://www.jornalcontabil.com.br/feed/", fonte: "Jornal Contábil", limit: 5 },
  { url: "https://www.gov.br/receitafederal/pt-br/assuntos/noticias/@@rss", fonte: "Receita Federal", limit: 4 },
];

function fetchWithTimeout(urlStr, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error("URL inválida: " + urlStr)); }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.get(u, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // redirect
        return fetchWithTimeout(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
  });
}

// Extrai <item>...</item> com seus campos do RSS
function parseRssItems(xml) {
  const items = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const mm = block.match(r);
      if (!mm) return "";
      return mm[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#\d+;/g, "")
        .trim();
    };
    const title = get("title");
    const link = get("link");
    const desc = get("description");
    const pubDate = get("pubDate");
    if (title && link) {
      items.push({ titulo: title, resumo: desc.slice(0, 240), url: link, data: pubDate });
    }
  }
  return items;
}

export async function getNews({ forceRefresh = false } = {}) {
  const out = { curadas: CURATED, externos: [], erros: [] };

  // Tenta RSS externos (silencioso se falhar)
  for (const src of RSS_SOURCES) {
    try {
      const xml = await fetchWithTimeout(src.url, 6000);
      const items = parseRssItems(xml).slice(0, src.limit).map((it) => ({
        ...it, fonte: src.fonte, externo: true,
      }));
      out.externos.push(...items);
    } catch (e) {
      out.erros.push({ fonte: src.fonte, erro: e.message });
    }
  }
  return out;
}
