// =============================================================================
//  pages/templates-list.js — gerenciar templates salvos
// =============================================================================
import { api, toast, el, fmtDate } from "../assets/app.js";

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" }, el("div", { class: "crumbs" }, el("strong", {}, "Templates salvos"))));
  const host = el("div", { class: "card" }, el("div", { class: "card__body" }));
  root.appendChild(host);
  await reload();

  async function reload() {
    let templates = [];
    try { templates = await api("/api/relatorio/templates"); } catch (e) { toast(e.message, "err"); return; }
    if (!templates.length) { host.innerHTML = ""; host.appendChild(el("div", { class: "empty" }, "Nenhum template salvo ainda. Crie em \"Gerar relatórios\".")); return; }
    host.innerHTML = "";
    const t = el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Nome"), el("th", {}, "Autor"), el("th", {}, "Campos"),
        el("th", {}, "Compartilhar"), el("th", {}, "Atualizado"),
        el("th", {}, "Ações"),
      )),
      el("tbody", {}, ...templates.map(row)),
    );
    host.appendChild(t);
  }

  function row(t) {
    return el("tr", {},
      el("td", {}, t.nome, t.descricao ? el("div", { class: "kv__label", style: "margin-top:2px" }, t.descricao) : null),
      el("td", {}, t.autor_nome || t.autor_username || "-"),
      el("td", {}, (t.campos || []).join(", ")),
      el("td", {}, t.compartilhar ? "★ sim" : "não"),
      el("td", {}, fmtDate(t.updated_at)),
      el("td", {},
        el("button", { class: "btn btn--sm", onClick: () => useTemplate(t) }, "Usar"),
        " ",
        el("button", { class: "btn btn--sm", onClick: () => removeT(t) }, "Excluir"),
      ),
    );
  }
  function useTemplate(t) {
    location.hash = "#/relatorios";
  }
  async function removeT(t) {
    if (!confirm(`Excluir template "${t.nome}"?`)) return;
    try { await api(`/api/relatorio/templates/${t.id}`, { method: "DELETE" }); toast("Removido"); await reload(); }
    catch (e) { toast(e.message, "err"); }
  }
}
