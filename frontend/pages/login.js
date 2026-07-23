// =============================================================================
//  pages/login.js — Tela de login com identidade Cordeiro
// =============================================================================
import { api, navigate, el, toast } from "../assets/app.js";
import { CORDEIRO_SVG } from "../assets/cordeiro.js";

export async function render(root) {
  const errBox = el("div", { class: "err" });
  const usernameInput = el("input", { class: "input", type: "text", placeholder: "seu usuário", autocomplete: "username", required: "true" });
  const passwordInput = el("input", { class: "input", type: "password", placeholder: "••••••••", autocomplete: "current-password", required: "true" });
  const submitBtn = el("button", { class: "btn btn--primary btn--lg", type: "submit" }, "Entrar no sistema");

  const form = el("form", { onSubmit: async (e) => {
    e.preventDefault();
    errBox.textContent = "";
    submitBtn.disabled = true; submitBtn.textContent = "Entrando…";
    try {
      const r = await api("/api/auth/login", {
        method: "POST",
        body: { username: usernameInput.value.trim(), password: passwordInput.value },
      });
      toast(`Bem-vindo, ${r.user.nome || r.user.username}!`);
      if (r.user.primeiro_login) navigate("change-password");
      else navigate("dashboard");
    } catch (e) {
      errBox.textContent = e.message || "Erro ao entrar";
      submitBtn.disabled = false; submitBtn.textContent = "Entrar no sistema";
    }
  } },
    el("div", { class: "brand" },
      el("div", { class: "logo-cordeiro logo-cordeiro--lg", html: CORDEIRO_SVG }),
      el("h1", {}, "Cordeiro Sistema"),
    ),
    el("div", { class: "sub" }, "Entre com seu usuário para acessar o painel fiscal."),
    el("div", { class: "field" }, el("label", {}, "Usuário"), usernameInput),
    el("div", { class: "field" }, el("label", {}, "Senha"), passwordInput),
    submitBtn,
    errBox,
    el("div", { class: "footer" },
      "Não tem conta? ",
      el("a", { href: "#/register", onClick: (e) => { e.preventDefault(); navigate("register"); } }, "Criar conta"),
    ),
  );

  root.appendChild(el("div", { class: "login-shell" }, el("div", { class: "login-card" }, form)));
  setTimeout(() => usernameInput.focus(), 50);
}
