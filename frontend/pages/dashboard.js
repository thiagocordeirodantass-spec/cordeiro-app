// =============================================================================
//  pages/dashboard.js — Dashboard com notícias fiscais + KPIs
// =============================================================================
import { api, fmtMoney, fmtDateShort, el, navigate } from "../assets/app.js";
import { ICONS } from "../assets/cordeiro.js";

export async function render(root) {
  // Pega o usuário do state global (setado em app.js)
  const u = window.__CORDEIRO_USER__;

  // ---- HERO com saudação ----
  const hero = el("div", { class: "dash-hero fade-in" },
    el("h1", {}, `Olá, ${u?.nome?.split(" ")[0] || "visitante"}! 🐑`),
    el("p", {}, "Bem-vindo de volta ao Cordeiro Sistema. Acompanhe as novidades do mundo fiscal e seus números."),
    el("div", { class: "quick-stats" },
      el("div", { class: "stat" }, el("div", { class: "v", id: "q-docs" }, "—"), el("div", { class: "l" }, "Documentos")),
      el("div", { class: "stat" }, el("div", { class: "v", id: "q-nfe" }, "—"), el("div", { class: "l" }, "NF-e")),
      el("div", { class: "stat" }, el("div", { class: "v", id: "q-cte" }, "—"), el("div", { class: "l" }, "CT-e")),
      el("div", { class: "stat" }, el("div", { class: "v", id: "q-valor" }, "—"), el("div", { class: "l" }, "Valor total")),
    ),
  );
  root.appendChild(hero);

  // ---- NOTÍCIAS FISCAIS ----
  const newsSection = el("div", { class: "card card--mod fade-in-1", "data-mod": "dashboard", style: "margin-top:20px" },
    el("div", { class: "card__head" },
      el("h2", { html: ICONS.news + '<span>Mundo Fiscal — Reforma Tributária</span>' }),
      el("div", { class: "topbar__actions" },
        el("a", { href: "https://www.gov.br/receitafederal/pt-br/assuntos/reforma-tributaria", target: "_blank", rel: "noopener", class: "btn btn--sm" }, "Ver mais notícias →"),
      ),
    ),
    el("div", { class: "card__body", id: "news-body" },
      el("div", { class: "empty" },
        el("div", { class: "spinner" }), " Carregando notícias…"
      )
    ),
  );
  root.appendChild(newsSection);

  // ---- KPIs detalhados ----
  const kpiSection = el("div", { class: "kpi-grid fade-in-2", style: "margin-top:20px" },
    kpiCard("Documentos", "—", "kpi-docs", "kpi--accent", "Total"),
    kpiCard("NF-e", "—", "kpi-nfe", "", "autorizadas"),
    kpiCard("CT-e", "—", "kpi-cte", "", "autorizados"),
    kpiCard("Valor total", "—", "kpi-valor", "kpi--success", "faturado"),
    kpiCard("Cancelados", "—", "kpi-canc", "kpi--warn", "do total"),
  );
  root.appendChild(kpiSection);

  // ---- Ações rápidas ----
  const acoes = el("div", { class: "card card--mod fade-in-3", "data-mod": "documents", style: "margin-top:20px" },
    el("div", { class: "card__head" }, el("h2", {}, "⚡ Ações rápidas")),
    el("div", { class: "card__body" },
      el("div", { style: "display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px" },
        quickAction("Importar XML", "import", "📥"),
        quickAction("Baixar do SEFAZ", "sefaz-download", "🔒"),
        quickAction("MeuDANFe API", "meudanfe", "🔎"),
        quickAction("Gerar relatório", "relatorios", "📊"),
        quickAction("Documentos", "documents", "📄"),
      ),
    ),
  );
  root.appendChild(acoes);

  // Carrega dados
  loadStats();
  loadNews();
}

function kpiCard(label, value, id, variant, sub) {
  return el("div", { class: `kpi ${variant}`, id, onClick: () => navigate("documents") },
    el("div", { class: "kpi__label" }, label),
    el("div", { class: "kpi__value" }, value),
    el("div", { class: "kpi__sub" }, sub),
  );
}

function quickAction(label, page, icon) {
  return el("button", { class: "btn", onClick: () => navigate(page) }, icon + " " + label);
}

async function loadStats() {
  try {
    const r = await api("/api/dashboard/kpis");
    const setText = (id, v) => { const x = document.getElementById(id); if (x) x.textContent = v; };
    setText("q-docs", r.total || 0);
    setText("q-nfe", r.nfe || 0);
    setText("q-cte", r.cte || 0);
    setText("q-valor", fmtMoney(r.valorTotal || 0));
    setText("kpi-docs", r.total || 0);
    setText("kpi-nfe", r.nfe || 0);
    setText("kpi-cte", r.cte || 0);
    setText("kpi-valor", fmtMoney(r.valorTotal || 0));
    setText("kpi-canc", r.cancelados || 0);
  } catch (e) { /* silencioso */ }
}

async function loadNews() {
  const body = document.getElementById("news-body");
  if (!body) return;
  try {
    const r = await api("/api/news");
    const curadas = r.curadas || [];
    const externos = r.externos || [];

    body.innerHTML = "";
    const grid = el("div", { class: "news-grid" });
    body.appendChild(grid);

    if (curadas.length) {
      const feat = curadas[0];
      grid.appendChild(renderNewsCard(feat, true));
    }
    for (const n of curadas.slice(1)) {
      grid.appendChild(renderNewsCard(n, false));
    }
    for (const n of externos) {
      grid.appendChild(renderNewsCard({ ...n, tag: "novo", tagLabel: "MANCHETE" }, false));
    }
    if (!curadas.length && !externos.length) {
      body.innerHTML = '<div class="empty">Nenhuma notícia disponível no momento.</div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="empty">Não foi possível carregar as notícias. ' + e.message + '</div>';
  }
}

function renderNewsCard(n, featured) {
  const tagClass = n.tag === "alerta" ? "tag--alerta" : n.tag === "reforma" ? "tag--reforma" : "tag--novo";
  return el("a", {
    href: n.url || "#",
    target: "_blank",
    rel: "noopener",
    class: `news-card ${featured ? "featured" : ""} fade-in`,
    style: "text-decoration:none; color:inherit",
  },
    el("div", { class: `tag ${tagClass}` }, n.tagLabel || "NOTÍCIA"),
    el("h3", {}, n.titulo),
    el("p", {}, n.resumo || ""),
    el("div", { class: "meta" },
      el("span", { class: "src" }, n.fonte || "—"),
      el("span", {}, "•"),
      el("span", {}, n.data ? fmtDateShort(n.data) : ""),
    ),
  );
}
