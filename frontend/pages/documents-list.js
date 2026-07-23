// =============================================================================
//  pages/documents-list.js — lista com filtros
// =============================================================================
import { api, apiDownload, fmtMoney, fmtDate, statusBadge, showModal, toast, el } from "../assets/app.js";

let cache = [];

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" }, el("strong", {}, "Documentos")),
    el("div", { class: "topbar__actions" },
      el("button", { class: "btn", onClick: load }, "Atualizar"),
    ),
  ));

  // filtros
  const f_kind = el("select", { class: "select" },
    el("option", { value: "" }, "Todos os tipos"),
    el("option", { value: "NFE" }, "NF-e"),
    el("option", { value: "CTE" }, "CT-e"),
  );
  const f_status = el("select", { class: "select" },
    el("option", { value: "" }, "Todos os status"),
    el("option", { value: "autorizado" }, "Autorizado"),
    el("option", { value: "cancelado" }, "Cancelado"),
    el("option", { value: "denegado" }, "Denegado"),
    el("option", { value: "rejeitado" }, "Rejeitado"),
    el("option", { value: "pendente" }, "Pendente"),
  );
  const f_uf = el("input", { class: "input", placeholder: "UF (ex: SP)" });
  const f_from = el("input", { class: "input", type: "date", title: "De" });
  const f_to = el("input", { class: "input", type: "date", title: "Até" });
  const f_q = el("input", { class: "input", placeholder: "Buscar (nome, doc, chave, número)" });
  const f_source = el("select", { class: "select" },
    el("option", { value: "" }, "Todas as origens"),
    el("option", { value: "upload" }, "Upload manual"),
    el("option", { value: "paste" }, "Colar XML"),
    el("option", { value: "sefaz-cert" }, "SEFAZ (cert A1)"),
    el("option", { value: "sefaz-cert-periodo" }, "SEFAZ (período/NSU)"),
    el("option", { value: "sefaz-provedor" }, "SEFAZ (provedor)"),
    el("option", { value: "generated" }, "Gerados pelo sistema"),
  );
  const applyBtn = el("button", { class: "btn btn--primary", onClick: load }, "Filtrar");
  const clearBtn = el("button", { class: "btn", onClick: () => { f_kind.value = ""; f_status.value = ""; f_uf.value = ""; f_from.value = ""; f_to.value = ""; f_q.value = ""; f_source.value = ""; load(); } }, "Limpar");

  // Suporta deep-link tipo #/documents?source=sefaz-cert
  const hash = location.hash.split("?")[1];
  if (hash) {
    const sp = new URLSearchParams(hash);
    if (sp.get("source")) f_source.value = sp.get("source");
  }

  const filterCard = el("div", { class: "card" },
    el("div", { class: "card__body" },
      el("div", { class: "row" },
        el("div", { class: "field" }, el("label", {}, "Tipo"), f_kind),
        el("div", { class: "field" }, el("label", {}, "Status"), f_status),
        el("div", { class: "field" }, el("label", {}, "UF"), f_uf),
        el("div", { class: "field" }, el("label", {}, "De"), f_from),
        el("div", { class: "field" }, el("label", {}, "Até"), f_to),
        el("div", { class: "field" }, el("label", {}, "Origem"), f_source),
        el("div", { class: "field" }, el("label", {}, "Buscar"), f_q),
        el("div", { class: "row--inline" }, applyBtn, clearBtn),
      ),
    ),
  );
  root.appendChild(filterCard);

  // tabela
  const tableHost = el("div", { class: "card", style: "margin-top:16px" });
  root.appendChild(tableHost);

  async function load() {
    const params = new URLSearchParams();
    if (f_kind.value) params.set("kind", f_kind.value);
    if (f_status.value) params.set("status", f_status.value);
    if (f_uf.value) params.set("uf", f_uf.value);
    if (f_from.value) params.set("dateFrom", f_from.value);
    if (f_to.value) params.set("dateTo", f_to.value);
    if (f_q.value) params.set("q", f_q.value);
    if (f_source.value) params.set("source", f_source.value);
    try {
      const rows = await api("/api/docs?" + params.toString());
      cache = rows;
      renderTable(tableHost, rows);
    } catch (e) { toast(e.message, "err"); }
  }
  await load();
}

function renderTable(host, rows) {
  host.innerHTML = "";
  if (!rows.length) {
    host.appendChild(el("div", { class: "card__body empty" }, "Nenhum documento encontrado com os filtros atuais."));
    return;
  }
  const t = el("table", { class: "table" },
    el("thead", {}, el("tr", {},
      el("th", {}, "Tipo"), el("th", {}, "Número"), el("th", {}, "Série"),
      el("th", {}, "Chave"), el("th", {}, "Emissão"),
      el("th", {}, "UF"), el("th", {}, "Remetente"), el("th", {}, "Destinatário"),
      el("th", { class: "num" }, "Valor"), el("th", {}, "Status"),
      el("th", {}, "Origem"),
      el("th", {}, "Ações"),
    )),
    el("tbody", {}, ...rows.map((r) => row(r))),
  );
  host.appendChild(t);
}

function row(r) {
  const tr = el("tr", { "data-doc-id": r.id },
    el("td", {}, r.kind === "NFE" ? "NF-e" : r.kind === "CTE" ? "CT-e" : r.kind || "-"),
    el("td", {}, cleanNum(r.numero)),
    el("td", {}, cleanNum(r.serie)),
    el("td", { class: "mono", style: "font-size:11.5px" }, (r.chave || "").replace(/^(\d{4}).*?(\d{4})$/, "$1…$2") || "-"),
    el("td", {}, fmtDate(r.data_emissao)),
    el("td", {}, `${r.uf_emitente || "-"}/${r.uf_destino || "-"}`),
    el("td", {}, r.remetente_nome || "-"),
    el("td", {}, r.destinatario_nome || "-"),
    el("td", { class: "num" }, fmtMoney(r.valor_total)),
    el("td", { html: statusBadge(r.status) }),
    el("td", { class: "kv__label" }, origemLabel(r.source)),
    el("td", {},
      el("button", { class: "btn btn--sm", onClick: () => showDetail(r) }, "Detalhes"),
      " ",
      el("button", { class: "btn btn--sm", onClick: () => downloadPdf(r) }, "PDF"),
      r.chave ? " " + el("button", { class: "btn btn--sm", onClick: () => consultarMeuDANFe(r) }, "🔍 MeuDANFe") : "",
      " ",
      podeExcluir() ? el("button", { class: "btn btn--sm btn--danger", onClick: () => excluirDocumento(r) }, "🗑 Excluir") : null,
    ),
  );
  return tr;
}

function podeExcluir() {
  const u = window.__CORDEIRO_USER__;
  return u && (u.role === "admin" || u.role === "operador");
}

async function excluirDocumento(r) {
  try {
    await api(`/api/docs/${r.id}`, { method: "DELETE" });
    toast("✓ Documento excluído");
    // remove a linha da tabela sem precisar recarregar tudo
    const tr = document.querySelector(`[data-doc-id="${r.id}"]`);
    if (tr) tr.remove();
    else carregarTabela();
  } catch (e) { toast(e.message, "err"); }
}

function consultarMeuDANFe(r) {
  if (!r.chave) { toast("Documento sem chave de acesso", "err"); return; }
  const url = `https://meudanfe.com.br/?chave=${encodeURIComponent(r.chave)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  toast("Abrindo MeuDANFe em nova aba…");
}

function origemLabel(s) {
  const map = {
    "upload": "Upload", "paste": "Colar", "generated": "Gerado",
    "sefaz-cert": "SEFAZ cert", "sefaz-cert-periodo": "SEFAZ NSU",
    "sefaz-provedor": "SEFAZ prov.",
  };
  return map[s] || s || "-";
}

function cleanNum(v) { v = String(v ?? ""); return /^\d+\.0$/.test(v) ? v.slice(0, -2) : v; }

async function showDetail(r) {
  let detail;
  try { detail = await api(`/api/docs/${r.id}`); } catch (e) { toast(e.message, "err"); return; }
  const body = el("div", {},
    el("div", { class: "detail-grid" },
      kv("Tipo", detail.kind === "NFE" ? "NF-e" : detail.kind === "CTE" ? "CT-e" : detail.kind),
      kv("Número", cleanNum(detail.numero)),
      kv("Série", cleanNum(detail.serie)),
      kv("Modelo", detail.modelo || "-"),
      kv("Data emissão", fmtDate(detail.data_emissao)),
      kv("UF", `${detail.uf_emitente || "-"} → ${detail.uf_destino || "-"}`),
      kv("Status", detail.status || "-"),
      kv("Protocolo", cleanNum(detail.protocolo) || "-"),
      kv("Remetente", detail.remetente_nome || "-"),
      kv("Doc. Remetente", cleanNum(detail.remetente_doc) || "-"),
      kv("Destinatário", detail.destinatario_nome || "-"),
      kv("Doc. Destinatário", cleanNum(detail.destinatario_doc) || "-"),
      kv("Valor total", fmtMoney(detail.valor_total)),
      kv("Origem", detail.source || "-"),
      kv("Chave", detail.chave || "-"),
    ),
    el("div", { style: "margin-top:14px" },
      el("label", { style: "font-size:11.5px; color:var(--muted); text-transform:uppercase" }, "XML"),
      el("textarea", { readonly: "true", style: "min-height:200px; font-size:11.5px" }, detail.xml || "(XML não encontrado)"),
    ),
  );
  showModal({
    title: `Documento ${detail.chave || detail.id}`,
    body,
    wide: true,
    footer: [
      el("button", { class: "btn", onClick: () => downloadXml(detail) }, "Baixar XML"),
      detail.chave ? el("button", { class: "btn", onClick: () => consultarMeuDANFe(detail) }, "🔍 Consultar no MeuDANFe") : null,
      el("button", { class: "btn btn--primary", onClick: () => downloadPdf(detail) }, "Baixar PDF"),
    ].filter(Boolean),
  });
}

function kv(label, value) {
  return el("div", { class: "kv" }, el("div", { class: "kv__label" }, label), el("div", { class: "kv__value" }, String(value || "-")));
}

function downloadPdf(r) { apiDownload(`/api/docs/${r.id}/pdf`, `${r.kind}-${cleanNum(r.numero) || r.chave || r.id}.pdf`); }
function downloadXml(r) { apiDownload(`/api/docs/${r.id}/xml`, `${r.chave || r.id}.xml`); }
