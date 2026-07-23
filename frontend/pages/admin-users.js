// =============================================================================
//  pages/admin-users.js — CRUD de usuários (somente admin)
// =============================================================================
import { api, toast, el, fmtDate, showModal } from "../assets/app.js";

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" }, el("strong", {}, "Usuários")),
    el("div", { class: "topbar__actions" }, el("button", { class: "btn btn--primary", onClick: novo }, "+ Novo usuário")),
  ));
  const host = el("div", { class: "card" }, el("div", { class: "card__body" }));
  root.appendChild(host);
  await reload();

  async function reload() {
    let users = [];
    try { users = await api("/api/users"); } catch (e) { toast(e.message, "err"); return; }
    if (!users.length) { host.innerHTML = ""; host.appendChild(el("div", { class: "empty" }, "Nenhum usuário.")); return; }
    host.innerHTML = "";
    const t = el("table", { class: "table" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Usuário"), el("th", {}, "Nome"), el("th", {}, "Email"),
        el("th", {}, "Perfil"), el("th", {}, "Ativo"),
        el("th", {}, "Último login"), el("th", {}, "Ações"),
      )),
      el("tbody", {}, ...users.map(row)),
    );
    host.appendChild(t);
  }

  function row(u) {
    return el("tr", {},
      el("td", { class: "mono" }, u.username),
      el("td", {}, u.nome),
      el("td", {}, u.email || "-"),
      el("td", {}, el("span", { class: "badge badge--neutral" }, u.role)),
      el("td", {}, u.ativo ? "Sim" : "Não"),
      el("td", {}, fmtDate(u.ultimo_login)),
      el("td", {},
        el("button", { class: "btn btn--sm", onClick: () => editar(u) }, "Editar"),
        " ",
        el("button", { class: "btn btn--sm", onClick: () => resetSenha(u) }, "Reset senha"),
        " ",
        u.id !== window.__CORDEIRO_USER__?.id
          ? el("button", { class: "btn btn--sm btn--danger", onClick: () => excluir(u) }, "🗑 Excluir")
          : el("span", { class: "kv__label", style: "font-size:11px" }, "(você)"),
      ),
    );
  }

  function novo() {
    const username = el("input", { class: "input", placeholder: "username" });
    const nome = el("input", { class: "input", placeholder: "Nome completo" });
    const email = el("input", { class: "input", placeholder: "Email (opcional)" });
    const role = el("select", { class: "select" }, el("option", { value: "operador" }, "Operador"), el("option", { value: "visualizador" }, "Visualizador"), el("option", { value: "admin" }, "Admin"));
    const ativo = el("input", { type: "checkbox", checked: "true" });
    const body = el("div", {},
      field("Username", username), field("Nome", nome), field("Email", email), field("Perfil", role),
      el("label", { class: "checkbox", style: "margin-top:8px" }, ativo, " Ativo"),
    );
    showModal({
      title: "Novo usuário",
      body,
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          try {
            const r = await api("/api/users", { method: "POST", body: {
              username: username.value, nome: nome.value, email: email.value, role: role.value, ativo: ativo.checked,
            }});
            document.querySelector(".modal-backdrop")?.remove();
            toast("Usuário criado");
            // mostra a senha temporária
            showModal({ title: "Usuário criado", body: el("div", {},
              el("p", {}, `Anote a senha temporária (não será exibida novamente):`),
              el("p", { class: "mono", style: "font-size:18px; padding:12px; background:#f1f5f9; border-radius:6px" }, r.senhaTemporaria),
            ), footer: [el("button", { class: "btn btn--primary", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "OK")] });
            await reload();
          } catch (e) { toast(e.message, "err"); }
        }}, "Criar"),
      ],
    });
  }

  function editar(u) {
    const nome = el("input", { class: "input", value: u.nome || "" });
    const email = el("input", { class: "input", value: u.email || "" });
    const role = el("select", { class: "select" }, el("option", { value: "operador" }, "Operador"), el("option", { value: "visualizador" }, "Visualizador"), el("option", { value: "admin" }, "Admin"));
    role.value = u.role;
    const ativo = el("input", { type: "checkbox" });
    if (u.ativo) ativo.checked = true;
    showModal({
      title: "Editar usuário",
      body: el("div", {}, field("Nome", nome), field("Email", email), field("Perfil", role), el("label", { class: "checkbox", style: "margin-top:8px" }, ativo, " Ativo")),
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          try {
            await api(`/api/users/${u.id}`, { method: "PUT", body: { nome: nome.value, email: email.value, role: role.value, ativo: ativo.checked }});
            document.querySelector(".modal-backdrop")?.remove();
            toast("Usuário atualizado");
            await reload();
          } catch (e) { toast(e.message, "err"); }
        }}, "Salvar"),
      ],
    });
  }

  async function resetSenha(u) {
    if (!confirm(`Resetar senha de ${u.username}?`)) return;
    try {
      const r = await api(`/api/users/${u.id}/reset-password`, { method: "POST" });
      showModal({ title: "Senha resetada", body: el("div", {},
        el("p", {}, "Anote a nova senha temporária:"),
        el("p", { class: "mono", style: "font-size:18px; padding:12px; background:#f1f5f9; border-radius:6px" }, r.senhaTemporaria),
      ), footer: [el("button", { class: "btn btn--primary", onClick: () => document.querySelector(".modal-backdrop")?.remove() }, "OK")] });
    } catch (e) { toast(e.message, "err"); }
  }
  async function excluir(u) {
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      toast(`Usuário "${u.username}" excluído`);
      await reload();
    } catch (e) { toast(e.message, "err"); }
  }
}

function field(label, input) {
  return el("div", { class: "field", style: "margin-top:8px" }, el("label", {}, label), input);
}
