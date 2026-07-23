// =============================================================================
//  pages/mail-config.js — configuração de SMTP para envio de email
// =============================================================================
import { api, toast, el } from "../assets/app.js";

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" },
      el("strong", {}, "Configuração de Email"),
      el("span", { class: "mod-tag" }, "SMTP"),
    ),
  ));

  const card = el("div", { class: "card card--mod", "data-mod": "users" });
  root.appendChild(card);

  // Carrega config atual
  let cfg;
  try { cfg = await api("/api/auth/mail/config"); } catch (e) { toast(e.message, "err"); return; }

  card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "📧 Servidor de envio (SMTP)")));
  const body = el("div", { class: "card__body" });

  // Banner de status
  const status = el("div", { class: "status-banner" });
  if (cfg.configured) {
    status.appendChild(el("div", { class: "kv__value", style: "color:var(--brand); font-weight:600" },
      "✓ Configurado — emails serão enviados de verdade"));
  } else {
    status.appendChild(el("div", { class: "kv__value", style: "color:#a06a06; font-weight:600" },
      "⚠ Não configurado — sistema está em modo console (código aparece no log do servidor e é auto-preenchido na tela)"));
  }
  body.appendChild(status);

  body.appendChild(el("p", { class: "kv__label" },
    "Para enviar emails de verdade, configure um servidor SMTP. O Gmail exige uma ",
    el("strong", {}, "Senha de App de 16 letras"), " (não a senha normal). Gere em ",
    el("a", { href: "https://myaccount.google.com/apppasswords", target: "_blank", rel: "noopener noreferrer" },
      "https://myaccount.google.com/apppasswords"),
    " (requer verificação em 2 etapas ativa)."
  ));

  // Form
  const inpHost = el("input", { class: "input", value: cfg.host || "smtp.gmail.com" });
  const inpPort = el("input", { class: "input", type: "number", value: cfg.port || 587 });
  const inpUser = el("input", { class: "input", value: cfg.user || "" });
  const inpPass = el("input", { class: "input", type: "password", placeholder: "Senha de App (16 letras)" });
  const inpFrom = el("input", { class: "input", value: cfg.from || "" });
  const inpSecure = el("input", { type: "checkbox" });
  if (cfg.secure) inpSecure.checked = true;

  const formRow = (label, input, hint) => el("div", { class: "field" },
    el("label", {}, label), input, hint ? el("p", { class: "kv__label", style: "margin-top:4px" }, hint) : null,
  );

  body.appendChild(el("div", { class: "row" },
    formRow("Servidor SMTP", inpHost, "Ex: smtp.gmail.com, smtp.office365.com, email-smtp.us-east-1.amazonaws.com"),
    formRow("Porta", inpPort, "587 (TLS) ou 465 (SSL)"),
  ));
  body.appendChild(el("div", { class: "row" },
    formRow("Usuário", inpUser, "Geralmente seu email completo"),
    formRow("Senha", inpPass, "Para Gmail: Senha de App. Para SES: SMTP password da AWS."),
  ));
  body.appendChild(el("div", { class: "row" },
    formRow("Remetente (From)", inpFrom, "Deixe vazio para usar o próprio usuário. Ex: 'Cordeiro Sistema <seu@email.com>'"),
    formRow("Usar SSL/TLS", el("label", { class: "checkbox" }, inpSecure, " Conexão segura (porta 465)")),
  ));

  // Teste
  const testInp = el("input", { class: "input", type: "email", placeholder: "seu@email.com (para teste)" });
  body.appendChild(el("div", { class: "row", style: "margin-top:14px" },
    formRow("Email para teste", testInp, "Envia um email de teste para validar a configuração"),
  ));

  const btnSalvar = el("button", { class: "btn btn--primary" }, "💾 Salvar configuração");
  const btnTestar = el("button", { class: "btn" }, "📨 Enviar email de teste");
  const out = el("div", { class: "kv__value", style: "margin-top:12px" });
  body.appendChild(el("div", { class: "row--inline", style: "margin-top:14px" }, btnSalvar, btnTestar, out));

  card.appendChild(body);

  btnSalvar.onclick = async () => {
    out.textContent = "Salvando…";
    try {
      await api("/api/auth/mail/config", { method: "POST", body: {
        host: inpHost.value, port: Number(inpPort.value) || 587,
        user: inpUser.value, pass: inpPass.value,
        from: inpFrom.value, secure: inpSecure.checked,
      }});
      out.textContent = "✓ Salvo. Agora teste enviando um email.";
      toast("Configuração salva");
    } catch (e) { out.textContent = "Erro: " + e.message; }
  };

  btnTestar.onclick = async () => {
    if (!testInp.value) { out.textContent = "Informe um email para teste."; return; }
    out.textContent = "Enviando…";
    try {
      const r = await api("/api/auth/mail/test", { method: "POST", body: { to: testInp.value } });
      out.textContent = r.ok ? "✓ Email enviado! Confira a caixa de entrada (e o spam)." : "✗ Falhou: " + (r.error || "?");
      if (r.ok) toast("Email de teste enviado");
    } catch (e) { out.textContent = "Erro: " + e.message; }
  };
}
