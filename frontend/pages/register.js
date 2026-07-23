// =============================================================================
//  pages/register.js — Cadastro de novo usuário com verificação por email
// =============================================================================
import { api, navigate, el, toast } from "../assets/app.js";
import { CORDEIRO_SVG } from "../assets/cordeiro.js";

export async function render(root) {
  // ----- PASSO 1: Formulário de dados + foto -----
  const inpNome = el("input", { class: "input", type: "text", placeholder: "Seu nome completo", required: "true" });
  const inpEmail = el("input", { class: "input", type: "email", placeholder: "seu@email.com", required: "true" });
  const inpUser = el("input", { class: "input", type: "text", placeholder: "usuario (sem espaços)", required: "true" });
  const inpPass = el("input", { class: "input", type: "password", placeholder: "Mínimo 4 caracteres", required: "true" });
  const inpFoto = el("input", { class: "input", type: "file", accept: "image/*" });
  const errBox = el("div", { class: "err" });
  const submitBtn = el("button", { class: "btn btn--primary btn--lg", type: "submit" }, "📧 Enviar código de verificação");

  // preview da foto
  const avatarPreview = el("div", { class: "avatar avatar--lg", style: "margin: 0 auto 12px" }, "?");
  inpFoto.onchange = () => {
    const f = inpFoto.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      avatarPreview.innerHTML = "";
      const img = el("img", { src: ev.target.result, alt: "Foto" });
      avatarPreview.appendChild(img);
    };
    reader.readAsDataURL(f);
  };

  const formStep1 = el("form", { onSubmit: async (e) => {
    e.preventDefault();
    errBox.textContent = "";
    submitBtn.disabled = true; submitBtn.textContent = "Enviando…";
    try {
      const fd = new FormData();
      fd.append("nome", inpNome.value.trim());
      fd.append("email", inpEmail.value.trim());
      fd.append("username", inpUser.value.trim());
      fd.append("password", inpPass.value);
      if (inpFoto.files?.[0]) fd.append("avatar", inpFoto.files[0]);
      const r = await fetch("/api/auth/register-start", { method: "POST", body: fd, credentials: "same-origin" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao enviar código");
      toast("📧 Código enviado para " + inpEmail.value);
      showStep2({ email: inpEmail.value.trim(), codigoDev: j.codigoDev });
    } catch (e) {
      errBox.textContent = e.message;
      submitBtn.disabled = false; submitBtn.textContent = "📧 Enviar código de verificação";
    }
  } },
    el("div", { class: "brand" },
      el("div", { class: "logo-cordeiro logo-cordeiro--lg", html: CORDEIRO_SVG }),
      el("h1", {}, "Criar conta"),
    ),
    el("div", { class: "sub" }, "Preencha seus dados — enviaremos um código de verificação no seu email."),
    el("div", { style: "text-align:center; margin-bottom:14px" },
      el("label", { for: "foto-input", style: "cursor:pointer" }, avatarPreview, el("div", { class: "kv__label" }, "📷 Foto de perfil (opcional)")),
      el("div", { style: "display:none" }, inpFoto),
    ),
    el("div", { class: "field" }, el("label", {}, "Nome completo"), inpNome),
    el("div", { class: "field" }, el("label", {}, "Email"), inpEmail),
    el("div", { class: "field" }, el("label", {}, "Usuário"), inpUser),
    el("div", { class: "field" }, el("label", {}, "Senha"), inpPass),
    inpFoto,
    submitBtn,
    errBox,
    el("div", { class: "footer" },
      "Já tem conta? ",
      el("a", { href: "#/login", onClick: (e) => { e.preventDefault(); navigate("login"); } }, "Entrar"),
    ),
  );

  // Clique na foto abre seletor
  const labelFoto = formStep1.querySelector('label[for="foto-input"]');
  labelFoto.onclick = (e) => { e.preventDefault(); inpFoto.click(); };

  const card = el("div", { class: "login-card" });

  function showStep1() { card.innerHTML = ""; card.appendChild(formStep1); }
  function showStep2({ email, codigoDev }) {
    card.innerHTML = "";
    const codeInputs = [];
    const codeRow = el("div", { class: "verify-code" });
    for (let i = 0; i < 6; i++) {
      const inp = el("input", { type: "text", inputmode: "numeric", maxlength: "1", pattern: "[0-9]" });
      inp.oninput = () => {
        inp.value = inp.value.replace(/\D/g, "").slice(0, 1);
        if (inp.value && i < 5) codeInputs[i + 1].focus();
      };
      inp.onkeydown = (e) => {
        if (e.key === "Backspace" && !inp.value && i > 0) codeInputs[i - 1].focus();
      };
      inp.onpaste = (e) => {
        e.preventDefault();
        const txt = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
        for (let j = 0; j < 6; j++) codeInputs[j].value = txt[j] || "";
        if (txt.length === 6) codeInputs[5].focus();
      };
      codeInputs.push(inp);
      codeRow.appendChild(inp);
    }

    const errBox2 = el("div", { class: "err" });
    const verifyBtn = el("button", { class: "btn btn--primary btn--lg btn--block", type: "button", onClick: () => doVerify() }, "✅ Verificar e criar conta");
    const resendBtn = el("button", { class: "btn btn--block", type: "button" }, "📧 Reenviar código");

    // Auto-preenche se for dev (sem SMTP) — ou se o backend devolver o código
    if (codigoDev) {
      // Preenche imediatamente para evitar que o usuário tenha que esperar
      for (let i = 0; i < 6; i++) codeInputs[i].value = String(codigoDev)[i] || "";
      // E dispara um "tick" visual para o usuário ver que foi preenchido
      codeInputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    }

    async function doVerify() {
      errBox2.textContent = "";
      const codigo = codeInputs.map((i) => i.value).join("");
      if (codigo.length !== 6) { errBox2.textContent = "Digite os 6 dígitos do código"; return; }
      verifyBtn.disabled = true; verifyBtn.textContent = "Verificando…";
      try {
        const r = await api("/api/auth/register-verify", { method: "POST", body: { email, codigo } });
        toast(`🎉 Conta criada! Bem-vindo, ${r.user.nome}`);
        navigate("dashboard");
      } catch (e) {
        errBox2.textContent = e.message;
        verifyBtn.disabled = false; verifyBtn.textContent = "✅ Verificar e criar conta";
      }
    }

    resendBtn.onclick = async () => {
      resendBtn.disabled = true; resendBtn.textContent = "Reenviando…";
      try {
        const r = await api("/api/auth/resend-code", { method: "POST", body: { email } });
        if (r.codigoDev) {
          for (let i = 0; i < 6; i++) codeInputs[i].value = r.codigoDev[i] || "";
        }
        toast("📧 Novo código enviado!");
        resendBtn.disabled = false; resendBtn.textContent = "📧 Reenviar código";
      } catch (e) {
        errBox2.textContent = e.message;
        resendBtn.disabled = false; resendBtn.textContent = "📧 Reenviar código";
      }
    };

    card.appendChild(
      el("div", {},
        el("div", { class: "brand" },
          el("div", { class: "logo-cordeiro logo-cordeiro--lg", html: CORDEIRO_SVG }),
          el("h1", {}, "Confirme seu email"),
        ),
        el("div", { class: "verify-banner" },
          "Enviamos um código de 6 dígitos para ", el("strong", {}, email)
        ),
        codigoDev ? el("div", {
          class: "dev-hint",
          style: "background:#fff3cd;border:1px solid #ffc107;padding:10px 14px;border-radius:8px;margin:10px 0;font-size:12.5px;color:#856404;text-align:center"
        },
          el("strong", {}, "⚠ Modo dev: "),
          "SMTP não enviou o email (credenciais inválidas ou modo console ativo). O código foi ",
          el("strong", {}, "auto-preenchido abaixo"),
          " para você concluir o teste. O email do remetente precisa estar configurado corretamente em Configurações."
        ) : null,
        el("p", { class: "kv__label", style: "text-align:center; margin:8px 0" }, "Digite o código abaixo:"),
        codeRow,
        verifyBtn,
        resendBtn,
        errBox2,
        el("div", { style: "margin-top:14px; text-align:center" },
          el("a", { href: "#", onClick: (e) => { e.preventDefault(); showStep1(); } }, "← Voltar e editar dados"),
        ),
      )
    );
    setTimeout(() => codeInputs[0].focus(), 50);
  }

  card.appendChild(formStep1);
  root.appendChild(el("div", { class: "login-shell" }, card));
}
