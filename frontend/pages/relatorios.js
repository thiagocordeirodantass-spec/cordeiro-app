// =============================================================================
//  pages/relatorios.js — geração de relatórios (XLSX/CSV/PDF) + templates
//  -----------------------------------------------------------------------------
//  Templates pré-definidos por módulo (NFe, CTe, Gerais) + customizáveis.
// =============================================================================
import { api, apiDownload, toast, el } from "../assets/app.js";

let TODOS_CAMPOS = []; // carregado do backend na primeira renderização
let TEMPLATES_MODULOS = {}; // { NFE: [...], CTE: [...], GERAIS: [...] }

export async function render(root) {
  if (!TODOS_CAMPOS.length) {
    try {
      const r = await api("/api/relatorio/campos");
      TODOS_CAMPOS = r.campos || [];
    } catch (e) { TODOS_CAMPOS = []; }
  }
  try {
    TEMPLATES_MODULOS = await api("/api/relatorio/templates-modulos");
  } catch (e) { TEMPLATES_MODULOS = { NFE: [], CTE: [], GERAIS: [] }; }

  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" },
      el("strong", {}, "Gerar relatórios"),
      el("span", { class: "mod-tag" }, "PERSONALIZADO"),
    ),
  ));

  const grid = el("div", { style: "display:grid; grid-template-columns:1fr 2fr; gap:16px" });
  root.appendChild(grid);

  // ---- Filtros principais ----
  const f_kind = sel("NFE", [["", "Todos os tipos"], ["NFE", "NF-e"], ["CTE", "CT-e"]]);
  const f_status = sel("", [["", "Todos status"], ["autorizado", "Autorizado"], ["cancelado", "Cancelado"], ["denegado", "Denegado"], ["rejeitado", "Rejeitado"], ["pendente", "Pendente"]]);
  const f_uf = el("input", { class: "input", placeholder: "UF (ex: SP)" });
  const f_from = el("input", { class: "input", type: "date" });
  const f_to = el("input", { class: "input", type: "date" });
  const f_q = el("input", { class: "input", placeholder: "Buscar (chave, CNPJ, nome, número)" });
  const f_formato = sel("xlsx", [["xlsx", "Excel (.xlsx)"], ["csv", "CSV"], ["pdf", "PDF (tabular)"], ["zip", "Pacote .zip (XML/PDF)"]]);

  // ===== TEMPLATES POR MÓDULO (cards visuais) =====
  const tplCardsHost = el("div", { style: "display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px" });
  function buildTplCards() {
    tplCardsHost.innerHTML = "";
    const modulo = f_kind.value || "GERAIS";
    const tpls = [
      ...(TEMPLATES_MODULOS.NFE || []).map((t) => ({ ...t, mod: "NFE" })),
      ...(TEMPLATES_MODULOS.CTE || []).map((t) => ({ ...t, mod: "CTE" })),
      ...(TEMPLATES_MODULOS.GERAIS || []).map((t) => ({ ...t, mod: "GERAIS" })),
    ];
    // Mostra todos, com badge do módulo
    for (const t of tpls) {
      const card = el("button", {
        class: "btn",
        style: "text-align:left; padding:10px 12px; display:flex; flex-direction:column; gap:4px; height:auto",
        onClick: () => {
          for (const [k, c] of Object.entries(campoChecks)) c.checked = t.campos.includes(k);
          toast(`✓ Template "${t.nome}" aplicado`);
        },
      },
        el("span", { style: "font-weight:600" }, t.nome),
        el("span", { class: "kv__label" }, `${t.campos.length} colunas • ${t.mod}`),
      );
      tplCardsHost.appendChild(card);
    }
  }

  // ---- Seletor de colunas ----
  const f_filtroCampo = el("input", { class: "input", placeholder: "🔍 Filtrar colunas pelo nome (ex: ICMS, CNPJ, UF)..." });
  const fieldsHost = el("div", { style: "display:grid; grid-template-columns:1fr 1fr; gap:6px; max-height:380px; overflow:auto; padding:6px; border:1px solid var(--line); border-radius:6px" });
  const campoChecks = {};
  const campoLabels = {};
  for (const c of TODOS_CAMPOS) {
    campoLabels[c.key] = c.label;
    const chk = el("input", { type: "checkbox", id: `fld-${c.key}` });
    campoChecks[c.key] = chk;
    fieldsHost.appendChild(el("label", { class: "checkbox", "data-key": c.key }, chk, ` ${c.label}`));
  }
  f_filtroCampo.oninput = () => {
    const q = f_filtroCampo.value.trim().toLowerCase();
    for (const [k, lbl] of Object.entries(campoLabels)) {
      const label = (k + " " + lbl).toLowerCase();
      const row = fieldsHost.querySelector(`label[data-key="${k}"]`);
      if (!row) continue;
      row.style.display = !q || label.includes(q) ? "" : "none";
    }
  };
  const btnAll = el("button", { class: "btn btn--sm", onClick: () => setAll(true) }, "Marcar todos");
  const btnNone = el("button", { class: "btn btn--sm", onClick: () => setAll(false) }, "Desmarcar todos");
  const btnInv = el("button", { class: "btn btn--sm", onClick: () => setAll(null) }, "Inverter");
  function setAll(val) {
    for (const [k, c] of Object.entries(campoChecks)) {
      const row = fieldsHost.querySelector(`label[data-key="${k}"]`);
      if (row && row.style.display === "none") continue;
      if (val === null) c.checked = !c.checked; else c.checked = val;
    }
  }

  f_kind.onchange = buildTplCards;

  const status = el("div", { class: "kv__value", style: "margin-top:8px" });
  const left = el("div", { class: "card card--mod", "data-mod": "relatorios" },
    el("div", { class: "card__head" }, el("h2", {}, "🎯 Filtros")),
    el("div", { class: "card__body" },
      el("div", { class: "row" },
        el("div", { class: "field" }, el("label", {}, "Tipo (define templates)"), f_kind),
        el("div", { class: "field" }, el("label", {}, "Status"), f_status),
        el("div", { class: "field" }, el("label", {}, "UF"), f_uf),
        el("div", { class: "field" }, el("label", {}, "De"), f_from),
        el("div", { class: "field" }, el("label", {}, "Até"), f_to),
        el("div", { class: "field" }, el("label", {}, "Buscar"), f_q),
      ),
      el("div", { class: "field", style: "margin-top:10px" }, el("label", {}, "Formato de saída"), f_formato),
    ),
  );
  grid.appendChild(left);

  const right = el("div", { class: "card card--mod", "data-mod": "relatorios" },
    el("div", { class: "card__head" }, el("h2", {}, "📋 Templates pré-definidos")),
    el("div", { class: "card__body" },
      tplCardsHost,
      el("h3", { style: "margin:18px 0 8px" }, `🔧 Colunas (${TODOS_CAMPOS.length} disponíveis do XML destrinchado)`),
      el("div", { class: "row--inline", style: "margin-bottom:8px" }, f_filtroCampo, btnAll, btnNone, btnInv),
      fieldsHost,
      el("div", { class: "row--inline", style: "margin-top:14px" },
        el("button", { class: "btn btn--primary", onClick: gerar }, "Gerar relatório"),
        el("button", { class: "btn", onClick: () => saveAsTemplate() }, "💾 Salvar como template"),
      ),
      status,
    ),
  );
  grid.appendChild(right);

  buildTplCards();

  function params() {
    const p = new URLSearchParams();
    for (const [k, v] of [["kind", f_kind], ["status", f_status], ["uf", f_uf], ["dateFrom", f_from], ["dateTo", f_to], ["q", f_q]]) {
      if (v.value) p.set(k, v.value);
    }
    return p;
  }
  function camposSelecionados() {
    const out = [];
    for (const [k, c] of Object.entries(campoChecks)) {
      const row = fieldsHost.querySelector(`label[data-key="${k}"]`);
      if (row && row.style.display === "none") continue;
      if (c.checked) out.push(k);
    }
    return out;
  }
  async function gerar() {
    const p = params();
    const campos = camposSelecionados();
    if (campos.length) p.set("campos", campos.join(","));
    const f = f_formato.value;
    const url = f === "csv" ? "/api/relatorio/csv"
              : f === "pdf" ? "/api/relatorio/pdf"
              : f === "zip" ? "/api/relatorio/lote"
              : "/api/relatorio/xlsx";
    if (f === "zip") p.set("formato", "xml_pdf");
    status.textContent = "Gerando...";
    try {
      await apiDownload(url + "?" + p.toString(), `relatorio-${Date.now()}.${f}`);
      status.textContent = "✓ Download iniciado.";
    } catch (e) { status.textContent = "Erro: " + e.message; }
  }
  async function saveAsTemplate() {
    const nome = prompt("Nome do template:");
    if (!nome) return;
    const descricao = prompt("Descrição (opcional):") || null;
    const compartilhar = confirm("Compartilhar com todos os usuários?");
    try {
      await api("/api/relatorio/templates", { method: "POST", body: {
        nome, descricao, compartilhar,
        campos: camposSelecionados(),
        filtros: Object.fromEntries(params()),
        incluir_itens: false,
      }});
      toast("Template salvo!");
    } catch (e) { toast(e.message, "err"); }
  }
}

function sel(value, opts) {
  const s = el("select", { class: "select" });
  for (const [v, l] of opts) s.appendChild(el("option", { value: v }, l));
  s.value = value;
  return s;
}
