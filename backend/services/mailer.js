// =============================================================================
//  services/mailer.js — envio de email via SMTP (Nodemailer) com template Cordeiro
//  -----------------------------------------------------------------------------
//  Configuracao via variaveis de ambiente (ou .env):
//    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
//  Se nenhuma config SMTP for fornecida, faz FALLBACK: loga o codigo no console
//  e devolve o codigo no JSON de resposta (apenas em dev, controlado por
//  process.env.NODE_ENV !== "production").
// =============================================================================
import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = (dataDir) => path.join(dataDir, "mail.config.json");

let cachedCfg = null;

export function loadMailConfig(dataDir) {
  if (cachedCfg) return cachedCfg;
  const env = {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "",
    secure: String(process.env.SMTP_SECURE || "false") === "true",
  };
  let fileCfg = {};
  try { fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH(dataDir), "utf-8")); } catch (e) {}
  cachedCfg = { ...env, ...fileCfg };
  return cachedCfg;
}

export function saveMailConfig(dataDir, partial) {
  const current = loadMailConfig(dataDir);
  const next = { ...current, ...partial };
  try { fs.writeFileSync(CONFIG_PATH(dataDir), JSON.stringify(next, null, 2), "utf-8"); } catch (e) {}
  cachedCfg = next;
  return maskMailConfig(next);
}

export function maskMailConfig(cfg) {
  return {
    configured: Boolean(cfg.host && cfg.user && cfg.pass),
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    from: cfg.from,
    secure: cfg.secure,
    pass: cfg.pass ? "••••••••" : "",
  };
}

export function getTransporter(dataDir) {
  const cfg = loadMailConfig(dataDir);
  if (!cfg.host || !cfg.user || !cfg.pass) return null;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

// =============================================================================
//  TEMPLATE HTML — Estilizado "Cordeiro Sistema" com logo de cordeiro
// =============================================================================
const CORDEIRO_SVG_INLINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g fill="#ffffff" stroke="#075c4b" stroke-width="1.5">
    <circle cx="20" cy="18" r="9"/><circle cx="32" cy="14" r="9"/><circle cx="44" cy="18" r="9"/>
    <circle cx="14" cy="28" r="9"/><circle cx="50" cy="28" r="9"/>
    <circle cx="22" cy="30" r="8"/><circle cx="42" cy="30" r="8"/>
  </g>
  <ellipse cx="32" cy="38" rx="11" ry="10" fill="#075c4b"/>
  <ellipse cx="22" cy="34" rx="3" ry="5" fill="#075c4b" transform="rotate(-25 22 34)"/>
  <ellipse cx="42" cy="34" rx="3" ry="5" fill="#075c4b" transform="rotate(25 42 34)"/>
  <circle cx="28" cy="38" r="1.5" fill="#ffffff"/>
  <circle cx="36" cy="38" r="1.5" fill="#ffffff"/>
  <ellipse cx="32" cy="43" rx="2.5" ry="2" fill="#a8a29e"/>
  <rect x="22" y="50" width="3" height="8" fill="#075c4b" rx="1"/>
  <rect x="28" y="50" width="3" height="8" fill="#075c4b" rx="1"/>
  <rect x="33" y="50" width="3" height="8" fill="#075c4b" rx="1"/>
  <rect x="39" y="50" width="3" height="8" fill="#075c4b" rx="1"/>
  <circle cx="54" cy="24" r="4" fill="#ffffff" stroke="#075c4b" stroke-width="1.5"/>
</svg>`;

export function buildVerificationEmail({ codigo, nomeUsuario, expiresMin = 15 }) {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f3ef;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
        <!-- Header verde com logo -->
        <tr>
          <td style="background:linear-gradient(135deg,#0e7c66 0%,#c69b2c 100%);padding:32px 28px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:50%;padding:8px;backdrop-filter:blur(4px);">
              ${CORDEIRO_SVG_INLINE}
            </div>
            <h1 style="margin:14px 0 4px;color:#ffffff;font-size:24px;font-weight:700;">Cordeiro Sistema</h1>
            <p style="margin:0;color:rgba(255,255,255,0.9);font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Sistema Fiscal Inteligente</p>
          </td>
        </tr>
        <!-- Conteudo -->
        <tr>
          <td style="padding:32px 28px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#1c1917;">Olá${nomeUsuario ? `, <strong>${nomeUsuario}</strong>` : ""}! 🐑</h2>
            <p style="margin:0 0 18px;font-size:14.5px;line-height:1.6;color:#44403c;">
              Recebemos um pedido de cadastro no <strong>Cordeiro Sistema</strong>. Para confirmar seu email e ativar sua conta, use o código de verificação abaixo:
            </p>
            <!-- Codigo em destaque -->
            <div style="background:linear-gradient(135deg,#0e7c66 0%,#075c4b 100%);border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Seu código de verificação</p>
              <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:36px;font-weight:700;color:#ffffff;letter-spacing:8px;margin:6px 0;">${codigo}</div>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:12px;">Válido por ${expiresMin} minutos</p>
            </div>
            <p style="margin:18px 0 8px;font-size:13.5px;line-height:1.6;color:#44403c;">
              Digite este código na tela de cadastro do sistema para concluir a ativação da sua conta.
            </p>
            <div style="background:#fdf3d1;border-left:4px solid #c69b2c;padding:12px 16px;border-radius:6px;margin:20px 0;">
              <p style="margin:0;font-size:13px;color:#7a5a16;">
                <strong>⚠️ Importante:</strong> Se você não fez este pedido, ignore este email. Sua conta não será criada sem a confirmação do código.
              </p>
            </div>
            <p style="margin:24px 0 4px;font-size:13px;color:#78716c;">Abraços,<br><strong style="color:#0e7c66;">Equipe Cordeiro Sistema</strong></p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fafaf7;padding:18px 28px;border-top:1px solid #e7e5e0;text-align:center;">
            <p style="margin:0;font-size:11.5px;color:#78716c;">Este é um email automático, por favor não responda.</p>
            <p style="margin:6px 0 0;font-size:11.5px;color:#a8a29e;">© ${new Date().getFullYear()} Cordeiro Sistema — Todos os direitos reservados</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Cordeiro Sistema — Código de verificação: ${codigo}\n\nOlá${nomeUsuario ? `, ${nomeUsuario}` : ""}!\n\nUse este código para confirmar seu cadastro no Cordeiro Sistema: ${codigo}\nVálido por ${expiresMin} minutos.\n\nSe você não fez este pedido, ignore este email.\n\n— Equipe Cordeiro Sistema`;
  return { html, text, subject: `🐑 Cordeiro Sistema — Seu código de verificação: ${codigo}` };
}

export async function sendVerificationCode({ to, codigo, nomeUsuario, dataDir, expiresMin = 15 }) {
  const cfg = loadMailConfig(dataDir);
  const tpl = buildVerificationEmail({ codigo, nomeUsuario, expiresMin });
  const transporter = getTransporter(dataDir);

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: cfg.from || cfg.user,
        to,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      });
      console.log(`[MAIL] Código enviado para ${to} (id=${info.messageId})`);
      // SMTP funcionou: o usuário recebeu o email de verdade
      return { ok: true, method: "smtp", devCode: null };
    } catch (e) {
      console.error(`[MAIL] Falha SMTP ao enviar para ${to}: ${e.message}`);
      console.error(`[MAIL] Caindo no modo console. Verifique SMTP_HOST/SMTP_USER/SMTP_PASS ou data/mail.config.json`);
      // cai no fallback de dev
    }
  }
  // Fallback dev: loga no console e devolve o codigo pro frontend auto-preencher
  console.log("");
  console.log("=================================================================");
  console.log(`  🐑 CORDEIRO SISTEMA — Código de verificação para ${to}`);
  console.log(`  Código: ${codigo}`);
  console.log(`  (SMTP não configurado ou falhou — código logado no console)`);
  console.log("=================================================================");
  console.log("");
  return { ok: true, method: "console", devCode: codigo };
}
