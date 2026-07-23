// =============================================================================
//  pages/change-password.js
// =============================================================================
import { api, navigate, el, toast } from "../assets/app.js";

export async function render(root) {
  const cur = el("input", { class: "input", type: "password", placeholder: "(atual — vazio se 1º acesso)" });
  const neu = el("input", { class: "input", type: "password", placeholder: "Nova senha (mín. 4)", required: "true" });
  const conf = el("input", { class: "input", type: "password", placeholder: "Confirmar nova senha", required: "true" });
  const err = el("div", { class: "err" });
  const btn = el("button", { class: "btn btn--primary", type: "submit" }, "Salvar nova senha");

  const form = el("form", { onSubmit: async (e) => {
    e.preventDefault();
    err.textContent = "";
    if (neu.value !== conf.value) { err.textContent = "As senhas não coincidem"; return; }
    if (neu.value.length < 4) { err.textContent = "A nova senha deve ter ao menos 4 caracteres"; return; }
    btn.disabled = true; btn.textContent = "Salvando…";
    try {
      await api("/api/auth/change-password", { method: "POST", body: { senhaAtual: cur.value || null, novaSenha: neu.value } });
      // atualiza user no state
      try {
        const me = await api("/api/auth/me");
        window.dispatchEvent(new Event("hashchange"));
      } catch (e) {}
      toast("Senha alterada com sucesso!");
      navigate("dashboard");
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false; btn.textContent = "Salvar nova senha";
    }
  }},
    el("h1", { style: "margin:0 0 6px; font-size:20px" }, "Trocar senha"),
    el("div", { class: "sub", style: "color:var(--muted); font-size:13px; margin-bottom:18px" }, "Por segurança, defina uma nova senha antes de continuar."),
    el("div", { class: "field" }, el("label", {}, "Senha atual"), cur),
    el("div", { class: "field" }, el("label", {}, "Nova senha"), neu),
    el("div", { class: "field" }, el("label", {}, "Confirmar nova senha"), conf),
    btn, err,
  );

  root.appendChild(el("div", { class: "login-shell" }, el("div", { class: "login-card" }, form)));
}
