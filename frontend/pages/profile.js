// =============================================================================
//  pages/profile.js — Perfil do usuário (foto, nome, email, troca de senha)
// =============================================================================
import { api, avatarEl, el, toast, navigate, devBanner } from "../assets/app.js";
import { CORDEIRO_SVG, ICONS } from "../assets/cordeiro.js";

export async function render(root) {
  const me = await api("/api/auth/me");
  const u = me.user;

  // ----- CARD FOTO + DADOS -----
  const fotoInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
  const avatarBig = el("div", { class: "avatar avatar--lg", style: "width:96px; height:96px; font-size:32px; margin:0 auto" });
  function refreshAvatar() {
    avatarBig.innerHTML = "";
    if (u.avatar_url) {
      const img = el("img", { src: u.avatar_url + "?t=" + Date.now(), alt: u.nome });
      avatarBig.appendChild(img);
    } else {
      const initials = (u.nome || u.username || "??").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
      avatarBig.textContent = initials;
    }
  }
  refreshAvatar();
  fotoInput.onchange = async () => {
    if (!fotoInput.files?.[0]) return;
    const fd = new FormData();
    fd.append("avatar", fotoInput.files[0]);
    try {
      const r = await fetch("/api/auth/me/avatar", { method: "POST", body: fd, credentials: "same-origin" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      u.avatar_url = j.user.avatar_url;
      u.avatar_path = j.user.avatar_path;
      refreshAvatar();
      toast("✓ Foto atualizada");
    } catch (e) { toast(e.message, "err"); }
  };

  const inpNome = el("input", { class: "input", value: u.nome || "" });
  const inpEmail = el("input", { class: "input", type: "email", value: u.email || "" });
  const btnSalvar = el("button", { class: "btn btn--primary" }, "💾 Salvar dados");
  btnSalvar.onclick = async () => {
    try {
      const r = await api("/api/auth/me", { method: "PUT", body: { nome: inpNome.value.trim(), email: inpEmail.value.trim() } });
      Object.assign(u, r.user);
      toast("✓ Dados atualizados");
    } catch (e) { toast(e.message, "err"); }
  };

  const btnRemoverFoto = el("button", { class: "btn" }, "🗑️ Remover foto");
  if (!u.avatar_url) btnRemoverFoto.style.display = "none";
  btnRemoverFoto.onclick = async () => {
    try {
      await api("/api/auth/me/avatar", { method: "DELETE" });
      u.avatar_url = null; u.avatar_path = null;
      refreshAvatar();
      btnRemoverFoto.style.display = "none";
      toast("✓ Foto removida");
    } catch (e) { toast(e.message, "err"); }
  };

  const perfilCard = el("div", { class: "card card--mod fade-in", "data-mod": "documents" },
    el("div", { class: "card__head" }, el("h2", {}, "🐑 Meu perfil")),
    el("div", { class: "card__body" },
      el("div", { style: "display:grid; grid-template-columns:140px 1fr; gap:20px; align-items:start" },
        el("div", { style: "text-align:center" },
          avatarBig,
          el("div", { style: "margin-top:10px; display:flex; flex-direction:column; gap:6px" },
            el("button", { class: "btn btn--sm", onClick: () => fotoInput.click() }, "📷 Trocar foto"),
            btnRemoverFoto,
          ),
        ),
        el("div", {},
          el("div", { class: "field" }, el("label", {}, "Nome completo"), inpNome),
          el("div", { class: "field", style: "margin-top:10px" }, el("label", {}, "Email"), inpEmail),
          el("div", { class: "field", style: "margin-top:10px" },
            el("label", {}, "Usuário (não pode ser alterado)"),
            el("input", { class: "input", value: u.username, readonly: "true", style: "background:var(--surface-2)" }),
          ),
          el("div", { class: "field", style: "margin-top:10px" },
            el("label", {}, "Perfil"),
            el("input", { class: "input", value: u.role, readonly: "true", style: "background:var(--surface-2); text-transform:capitalize" }),
          ),
          el("div", { style: "margin-top:14px" }, btnSalvar),
        ),
      ),
    ),
  );

  // ----- CARD TROCAR SENHA -----
  const inpSenhaAtual = el("input", { class: "input", type: "password" });
  const inpNovaSenha = el("input", { class: "input", type: "password" });
  const inpConfSenha = el("input", { class: "input", type: "password" });
  const statSenha = el("div", { class: "kv__value", style: "margin-top:8px" });
  const btnSalvarSenha = el("button", { class: "btn btn--primary" }, "🔒 Alterar senha");
  btnSalvarSenha.onclick = async () => {
    if (inpNovaSenha.value !== inpConfSenha.value) { statSenha.textContent = "Senhas não conferem"; return; }
    if (inpNovaSenha.value.length < 4) { statSenha.textContent = "Mínimo 4 caracteres"; return; }
    btnSalvarSenha.disabled = true; statSenha.textContent = "Salvando…";
    try {
      await api("/api/auth/change-password", { method: "POST", body: { senhaAtual: inpSenhaAtual.value, novaSenha: inpNovaSenha.value } });
      statSenha.textContent = "✓ Senha alterada";
      inpSenhaAtual.value = inpNovaSenha.value = inpConfSenha.value = "";
    } catch (e) { statSenha.textContent = e.message; }
    btnSalvarSenha.disabled = false;
  };

  const senhaCard = el("div", { class: "card card--mod fade-in-1", "data-mod": "documents", style: "margin-top:16px" },
    el("div", { class: "card__head" }, el("h2", {}, "🔒 Trocar senha")),
    el("div", { class: "card__body" },
      el("div", { class: "field" }, el("label", {}, "Senha atual"), inpSenhaAtual),
      el("div", { class: "field", style: "margin-top:10px" }, el("label", {}, "Nova senha (mín. 4 caracteres)"), inpNovaSenha),
      el("div", { class: "field", style: "margin-top:10px" }, el("label", {}, "Confirmar nova senha"), inpConfSenha),
      el("div", { style: "margin-top:14px" }, btnSalvarSenha, statSenha),
    ),
  );

  fotoInput && root.appendChild(fotoInput);
  root.appendChild(perfilCard);
  root.appendChild(senhaCard);
}
