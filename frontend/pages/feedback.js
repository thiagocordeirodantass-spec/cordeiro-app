// =============================================================================
//  pages/feedback.js — Chat de feedback dos usuários para os devs
//  -----------------------------------------------------------------------------
//  - Qualquer usuário autenticado pode enviar feedback (sugestão, bug, etc.)
//  - Usuário vê os PRÓPRIOS feedbacks com o status e a resposta do admin
//  - Administrador vê TODOS os feedbacks, pode responder e mudar status
// =============================================================================
import { api, toast, el, fmtDate, showModal } from "../assets/app.js";

const CATEGORIAS = [
  { value: "bug",          label: "🐛 Bug / Erro",            cor: "badge--cancel" },
  { value: "melhoria",     label: "✨ Melhoria",              cor: "badge--accent" },
  { value: "implementacao",label: "🚀 Nova implementação",    cor: "badge--ok" },
  { value: "duvida",       label: "❓ Dúvida",                cor: "badge--neutral" },
  { value: "outro",        label: "💬 Outro",                 cor: "badge--neutral" },
];

const STATUS = {
  aberto:     { label: "Aberto",      cor: "badge--pending" },
  em_analise: { label: "Em análise",  cor: "badge--accent"  },
  resolvido:  { label: "Resolvido",   cor: "badge--ok"      },
  rejeitado:  { label: "Rejeitado",   cor: "badge--cancel"  },
};

export async function render(root) {
  const u = window.__CORDEIRO_USER__;
  const isAdmin = u && u.role === "admin";

  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" },
      el("strong", {}, "Feedback"),
      el("span", { class: "mod-tag" }, isAdmin ? "Administração" : "Sugestões e bugs"),
    ),
    el("div", { class: "topbar__actions" },
      el("button", { class: "btn btn--primary", onClick: () => abrirForm() }, "+ Novo feedback"),
    ),
  ));

  // Card informativo
  const intro = el("div", { class: "card" },
    el("div", { class: "card__body" },
      el("p", {}, el("strong", {}, "📢 Sua opinião importa! "), "Use este espaço para sugerir novas funcionalidades, reportar bugs ou enviar ideias de melhoria. Os administradores recebem e respondem por aqui mesmo."),
    ),
  );
  root.appendChild(intro);

  // Abas: "Meus" / "Todos" (admin)
  const tabMeus = el("button", { class: "btn btn--sm", onClick: () => load("me") }, "📥 Meus feedbacks");
  const tabTodos = isAdmin
    ? el("button", { class: "btn btn--sm", onClick: () => load("all") }, "📋 Todos (admin)")
    : null;
  if (isAdmin) tabTodos.classList.add("btn--primary");

  const tabsBar = el("div", { style: "display:flex; gap:6px; margin:12px 0 8px" }, tabMeus, tabTodos);
  root.appendChild(tabsBar);

  // Filtros (só para admin / "Todos")
  const filters = el("div", { class: "card", style: "display:none; margin-bottom:12px" },
    el("div", { class: "card__body" },
      el("div", { class: "row" },
        filterSelect("Status", "status", "todos", [
          ["todos","Todos"],["aberto","Aberto"],["em_analise","Em análise"],["resolvido","Resolvido"],["rejeitado","Rejeitado"]
        ]),
        filterSelect("Categoria", "categoria", "todas", [
          ["todas","Todas"],["bug","Bug"],["melhoria","Melhoria"],["implementacao","Nova impl."],["duvida","Dúvida"],["outro","Outro"]
        ]),
      ),
    ),
  );
  root.appendChild(filters);

  // Tabela
  const host = el("div", { class: "card" }, el("div", { class: "card__body" }, el("div", { class: "empty" }, "Carregando…")));
  root.appendChild(host);

  let currentScope = isAdmin ? "all" : "me";

  async function load(scope) {
    currentScope = scope;
    if (scope === "all") {
      tabMeus.classList.remove("btn--primary");
      tabTodos.classList.add("btn--primary");
      filters.style.display = "";
    } else {
      tabTodos?.classList.remove("btn--primary");
      tabMeus.classList.add("btn--primary");
      filters.style.display = "none";
    }
    await reload();
  }

  async function reload() {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "card__body" }, el("div", { class: "empty" }, "Carregando…")));
    let items = [];
    try {
      if (currentScope === "all") {
        const status = filters.querySelector("select[data-k='status']").value;
        const categoria = filters.querySelector("select[data-k='categoria']").value;
        const qs = new URLSearchParams();
        if (status !== "todos") qs.set("status", status);
        if (categoria !== "todas") qs.set("categoria", categoria);
        items = await api("/api/feedback" + (qs.toString() ? "?" + qs : ""));
      } else {
        items = await api("/api/feedback/me");
      }
    } catch (e) {
      host.innerHTML = "";
      host.appendChild(el("div", { class: "card__body" }, el("div", { class: "empty" }, "❌ " + e.message)));
      return;
    }
    if (!items.length) {
      host.innerHTML = "";
      host.appendChild(el("div", { class: "card__body" },
        el("div", { class: "empty" },
          currentScope === "all"
            ? "Nenhum feedback encontrado com esses filtros."
            : "Você ainda não enviou nenhum feedback. Clique em \"+ Novo feedback\" para começar."
        )
      ));
      return;
    }
    host.innerHTML = "";
    host.appendChild(el("div", { class: "card__body" },
      el("table", { class: "table table--compact" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Data"),
          el("th", {}, "Categoria"),
          el("th", {}, "Assunto"),
          el("th", {}, "Autor"),
          el("th", {}, "Status"),
          el("th", {}, "Ações"),
        )),
        el("tbody", {}, ...items.map(row)),
      ),
    ));
  }

  function row(f) {
    const cat = CATEGORIAS.find((c) => c.value === f.categoria) || CATEGORIAS[4];
    const st = STATUS[f.status] || STATUS.aberto;
    const tr = el("tr", { "data-fb-id": f.id },
      el("td", { class: "mono", style: "white-space:nowrap" }, fmtDate(f.createdAt)),
      el("td", {}, el("span", { class: `badge ${cat.cor}` }, cat.label)),
      el("td", {}, f.assunto || el("em", { class: "kv__label" }, "(sem assunto)")),
      el("td", {}, f.username || "-"),
      el("td", {}, el("span", { class: `badge ${st.cor}` }, st.label)),
      el("td", {},
        el("button", { class: "btn btn--sm", onClick: () => verDetalhes(f) }, "Abrir"),
        isAdmin ? " " + el("button", { class: "btn btn--sm btn--danger", onClick: () => excluir(f) }, "🗑") : null,
      ),
    );
    return tr;
  }

  function filterSelect(label, k, defaultValue, opts) {
    const sel = el("select", { class: "select", "data-k": k });
    for (const [v, l] of opts) {
      const o = el("option", { value: v }, l);
      if (v === defaultValue) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = reload;
    return el("div", { class: "field" },
      el("label", {}, label),
      sel,
    );
  }

  // ============= FORM DE NOVO FEEDBACK =============
  function abrirForm(feedbackPrevio = null) {
    const isEdit = !!feedbackPrevio;
    const categoria = el("select", { class: "select" });
    for (const c of CATEGORIAS) {
      const o = el("option", { value: c.value }, c.label);
      if (feedbackPrevio && feedbackPrevio.categoria === c.value) o.selected = true;
      categoria.appendChild(o);
    }
    const assunto = el("input", { class: "input", placeholder: "Resumo curto (opcional)", value: feedbackPrevio?.assunto || "" });
    const mensagem = el("textarea", { class: "input", placeholder: "Descreva sua ideia, bug ou sugestão...", style: "min-height:160px" }, feedbackPrevio?.mensagem || "");
    const anonimo = el("input", { type: "checkbox" });
    if (feedbackPrevio?.anonimo) anonimo.checked = true;

    const body = el("div", {},
      el("div", { class: "field" }, el("label", {}, "Categoria"), categoria),
      el("div", { class: "field" }, el("label", {}, "Assunto"), assunto),
      el("div", { class: "field" }, el("label", {}, "Mensagem"), mensagem),
      el("label", { class: "checkbox", style: "margin-top:6px" }, anonimo, " Enviar como anônimo (admins veem seu nome, mas a listagem pública esconde)"),
    );
    showModal({
      title: isEdit ? "Editar feedback" : "Novo feedback",
      body,
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          if (!mensagem.value.trim()) { toast("Escreva uma mensagem", "err"); return; }
          try {
            if (isEdit) {
              await api(`/api/feedback/${feedbackPrevio.id}`, { method: "PATCH", body: {
                categoria: categoria.value, assunto: assunto.value, mensagem: mensagem.value, anonimo: anonimo.checked,
              }});
              toast("Feedback atualizado");
            } else {
              await api("/api/feedback", { method: "POST", body: {
                categoria: categoria.value, assunto: assunto.value, mensagem: mensagem.value, anonimo: anonimo.checked,
              }});
              toast("Feedback enviado! O administrador será notificado.");
            }
            document.querySelector(".modal-backdrop")?.remove();
            await reload();
          } catch (e) { toast(e.message, "err"); }
        }}, isEdit ? "Salvar" : "Enviar"),
      ],
    });
  }

  // ============= DETALHES + RESPOSTA (admin) =============
  function verDetalhes(f) {
    const cat = CATEGORIAS.find((c) => c.value === f.categoria) || CATEGORIAS[4];
    const st = STATUS[f.status] || STATUS.aberto;
    const body = el("div", {},
      el("div", { class: "kv" },
        kv("Data", fmtDate(f.createdAt)),
        kv("Autor", f.username || "-"),
        kv("Categoria", el("span", { class: `badge ${cat.cor}` }, cat.label)),
        kv("Status", el("span", { class: `badge ${st.cor}` }, st.label)),
        kv("Assunto", f.assunto || "-"),
      ),
      el("div", { style: "margin-top:12px" },
        el("label", { class: "kv__label" }, "Mensagem original"),
        el("div", { class: "callout", style: "white-space:pre-wrap; line-height:1.5" }, f.mensagem),
      ),
      f.resposta ? el("div", { style: "margin-top:14px" },
        el("label", { class: "kv__label" }, `Resposta do administrador (${f.respondidoPor || "?"} · ${fmtDate(f.respondidoEm)})`),
        el("div", { class: "callout callout--ok", style: "white-space:pre-wrap; line-height:1.5" }, f.resposta),
      ) : null,
    );
    const footer = [];
    if (isAdmin) {
      footer.push(el("button", { class: "btn", onClick: () => mudarStatus(f) }, "🔁 Mudar status"));
      footer.push(el("button", { class: "btn btn--primary", onClick: () => responder(f) }, f.resposta ? "Editar resposta" : "Responder"));
    } else if (!f.resposta) {
      // usuário pode editar o próprio feedback se ainda não foi respondido
      footer.push(el("button", { class: "btn", onClick: () => {
        document.querySelector(".modal-backdrop")?.remove();
        abrirForm(f);
      }}, "Editar"));
    }
    footer.push(el("button", { class: "btn", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "Fechar"));
    showModal({ title: "Detalhes do feedback", body, footer });
  }

  function mudarStatus(f) {
    const sel = el("select", { class: "select" });
    for (const [v, s] of Object.entries(STATUS)) {
      const o = el("option", { value: v }, s.label);
      if (v === f.status) o.selected = true;
      sel.appendChild(o);
    }
    const body = el("div", {},
      el("div", { class: "field" }, el("label", {}, "Novo status"), sel),
    );
    showModal({
      title: "Mudar status",
      body,
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          try {
            await api(`/api/feedback/${f.id}`, { method: "PATCH", body: { status: sel.value } });
            toast("Status atualizado");
            document.querySelectorAll(".modal-backdrop").forEach((m) => m.remove());
            await reload();
          } catch (e) { toast(e.message, "err"); }
        }}, "Salvar"),
      ],
    });
  }

  function responder(f) {
    const ta = el("textarea", { class: "input", placeholder: "Escreva a resposta para o usuário...", style: "min-height:160px" }, f.resposta || "");
    const body = el("div", {},
      el("p", { class: "kv__label" }, "Responder marca o status como \"Resolvido\" automaticamente. Ajuste o status depois se quiser."),
      el("div", { class: "field" }, el("label", {}, "Resposta"), ta),
    );
    showModal({
      title: f.resposta ? "Editar resposta" : "Responder feedback",
      body,
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          if (!ta.value.trim()) { toast("A resposta não pode estar vazia", "err"); return; }
          try {
            await api(`/api/feedback/${f.id}`, { method: "PATCH", body: { resposta: ta.value } });
            toast("Resposta enviada");
            document.querySelectorAll(".modal-backdrop").forEach((m) => m.remove());
            await reload();
          } catch (e) { toast(e.message, "err"); }
        }}, "Enviar resposta"),
      ],
    });
  }

  async function excluir(f) {
    if (!confirm(`Excluir definitivamente o feedback "${f.assunto || f.mensagem.slice(0,30) + "..."}"?`)) return;
    try {
      await api(`/api/feedback/${f.id}`, { method: "DELETE" });
      toast("Feedback excluído");
      await reload();
    } catch (e) { toast(e.message, "err"); }
  }

  function kv(label, value) {
    return el("div", { class: "kv__row" }, el("span", { class: "kv__label" }, label), el("span", { class: "kv__value" }, value));
  }

  // Boot
  await load(currentScope);
}
