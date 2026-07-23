// =============================================================================
//  assets/app.js — shell, roteador hash, estado de sessão, fetch wrapper
// =============================================================================

import { logoCordeiro, ICONS, devBanner, CORDEIRO_SVG } from "./cordeiro.js";

const root = document.getElementById("app-root");

const state = {
  user: null,
  page: null,
  loadedPages: new Map(),
};

// ---- Helpers ----
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = v;
    else if (v === false || v == null) continue;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function fmtMoney(v) {
  const n = Number(v);
  if (!isFinite(n)) return v ?? "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function fmtDate(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleString("pt-BR");
}
export function fmtDateShort(s) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString("pt-BR");
}

export function statusBadge(status) {
  const cls = status === "autorizado" ? "badge--ok"
    : status === "cancelado" ? "badge--cancel"
    : status === "denegado" || status === "rejeitado" ? "badge--cancel"
    : "badge--pending";
  return `<span class="badge ${cls}">${status || "pendente"}</span>`;
}

export function toast(msg, kind = "ok") {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = el("div", { class: "toast-host" });
    document.body.appendChild(host);
  }
  const t = el("div", { class: `toast toast--${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity 0.3s"; }, 2700);
  setTimeout(() => t.remove(), 3200);
}

export function showModal({ title, body, footer, wide = false, onClose = null }) {
  const close = () => { backdrop.remove(); if (onClose) onClose(); };
  const backdrop = el("div", { class: "modal-backdrop", onClick: (e) => { if (e.target === backdrop) close(); } });
  const modal = el("div", { class: `modal ${wide ? "modal--wide" : ""}` },
    el("div", { class: "modal__head" },
      el("h3", {}, title),
      el("button", { class: "btn btn--ghost btn--icon", onClick: close }, "×")
    ),
    el("div", { class: "modal__body" }, body),
    footer ? el("div", { class: "modal__foot" }, footer) : null,
  );
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  return { close, modal };
}

async function api(path, options = {}) {
  const opts = { credentials: "same-origin", ...options };
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(path, opts);
  if (r.status === 401) {
    // 401 em /api/auth/* é erro de credenciais — não redireciona nem desloga
    if (!path.includes("/api/auth/")) {
      state.user = null;
      navigate("login");
    }
    let msg = "Não autenticado";
    try { const j = await r.json(); if (j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return r.json();
  return r;
}
export { api };

export async function apiDownload(path, filename) {
  const r = await fetch(path, { credentials: "same-origin" });
  if (r.status === 401) { state.user = null; navigate("login"); throw new Error("Não autenticado"); }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename || "download", style: "display:none" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function avatarEl(user, size = "") {
  const cls = `avatar ${size}`;
  const a = el("div", { class: cls });
  if (user && user.avatar_url) {
    const img = el("img", { src: user.avatar_url, alt: user.nome || user.username });
    a.appendChild(img);
  } else {
    const initials = (user?.nome || user?.username || "??").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
    a.textContent = initials;
  }
  return a;
}

// =============================================================================
//  ROTEADOR
// =============================================================================
const PAGES = {
  login: { module: () => import("../pages/login.js"), public: true },
  register: { module: () => import("../pages/register.js"), public: true },
  dashboard: { module: () => import("../pages/dashboard.js") },
  documents: { module: () => import("../pages/documents-list.js") },
  import: { module: () => import("../pages/import.js") },
  "portal-nacional": { module: () => import("../pages/portal-nacional.js") },
  "sefaz-download": { module: () => import("../pages/sefaz-download.js") },
  meudanfe: { module: () => import("../pages/meudanfe.js") },
  relatorios: { module: () => import("../pages/relatorios.js") },
  templates: { module: () => import("../pages/templates-list.js") },
  audit: { module: () => import("../pages/audit-log.js") },
  profile: { module: () => import("../pages/profile.js") },
  feedback: { module: () => import("../pages/feedback.js") },
  users: { module: () => import("../pages/admin-users.js"), admin: true },
  "mail-config": { module: () => import("../pages/mail-config.js"), admin: true },
  "change-password": { module: () => import("../pages/change-password.js") },
};

const NAV = [
  { section: "Principal", items: [
    { key: "dashboard", label: "Início", icon: "dashboard" },
    { key: "documents", label: "Documentos", icon: "documents" },
    { key: "import", label: "Importar XML", icon: "import", oper: true },
  ]},
  { section: "Integrações", items: [
    { key: "portal-nacional", label: "Portal Nacional", icon: "portal" },
    { key: "sefaz-download", label: "Baixar do SEFAZ", icon: "sefaz", oper: true },
    { key: "meudanfe", label: "MeuDANFe API", icon: "meudanfe" },
  ]},
  { section: "Relatórios", items: [
    { key: "relatorios", label: "Gerar relatórios", icon: "relatorios" },
    { key: "templates", label: "Templates salvos", icon: "templates" },
    { key: "audit", label: "Histórico / Auditoria", icon: "audit" },
  ]},
  { section: "Comunidade", items: [
    { key: "feedback", label: "Feedback / Sugestões", icon: "feedback" },
  ]},
  { section: "Administração", admin: true, items: [
    { key: "users", label: "Usuários", icon: "users" },
    { key: "mail-config", label: "Email (SMTP)", icon: "news" },
  ]},
];

export function navigate(page) {
  location.hash = `#/${page}`;
}

async function mountPage(page) {
  if (!PAGES[page]) page = "dashboard";
  if (page === "login" || page === "register") {
    root.innerHTML = "";
    const mod = await PAGES[page].module();
    await mod.render(root);
    return;
  }
  if (!state.user) {
    try {
      const me = await api("/api/auth/me");
      state.user = me.user;
      window.__CORDEIRO_USER__ = me.user;
    } catch (e) {
      navigate("login");
      return;
    }
  }
  if (state.user.primeiro_login && page !== "change-password") {
    navigate("change-password");
    return;
  }
  if (PAGES[page].admin && state.user.role !== "admin") {
    toast("Acesso restrito a administradores", "err");
    navigate("dashboard");
    return;
  }
  renderShell(page);
  const mod = await PAGES[page].module();
  const pageRoot = document.getElementById("page-root");
  pageRoot.innerHTML = "";
  await mod.render(pageRoot);
  document.querySelectorAll(".side__nav a").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.page === page);
  });
}

function renderShell(page) {
  root.innerHTML = "";
  const u = state.user;
  const isAdmin = u.role === "admin";
  const isOper = u.role === "operador" || isAdmin;

  // --- Banner "em desenvolvimento" no topo ---
  root.appendChild(devBanner());

  // --- Sidebar ---
  const sideSections = [];
  for (const sec of NAV) {
    if (sec.admin && !isAdmin) continue;
    const items = sec.items.filter((it) => !it.oper || isOper).map((it) => {
      const a = el("a", { href: `#/${it.key}`, "data-page": it.key, onClick: (e) => { e.preventDefault(); navigate(it.key); } });
      a.innerHTML = ICONS[it.icon] || "";
      const lbl = el("span", { class: "label" }, it.label);
      a.appendChild(lbl);
      if (it.key === page) a.classList.add("is-active");
      return a;
    });
    if (!items.length) continue;
    sideSections.push(el("div", {},
      el("div", { class: "side__section" }, sec.section),
      el("nav", { class: "side__nav" }, ...items),
    ));
  }

  const userAvatar = avatarEl(u);
  const side = el("aside", { class: "side" },
    el("div", { class: "side__brand" },
      el("div", { class: "logo-cordeiro", html: CORDEIRO_SVG }),
      el("div", {},
        el("h1", {}, "Cordeiro"),
        el("small", {}, "Sistema Fiscal")
      )
    ),
    ...sideSections,
    el("div", { class: "side__user" },
      userAvatar,
      el("div", { class: "info" },
        el("a", { href: "#/profile", class: "who", onClick: (e) => { e.preventDefault(); navigate("profile"); } }, u.nome || u.username),
        el("span", { class: "role" }, `${u.username} · ${u.role}`)
      ),
      el("button", { class: "logout-btn", title: "Sair", onClick: doLogout, html: ICONS.exit })
    )
  );

  const main = el("main", { class: "main", id: "page-root" }, el("div", { class: "splash" }, "Carregando…"));

  const app = el("div", { class: "app" }, side, main);
  root.appendChild(app);
}

async function doLogout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {}
  state.user = null;
  navigate("login");
}

async function checkSession() {
  try {
    const me = await api("/api/auth/me");
    state.user = me.user;
    window.__CORDEIRO_USER__ = me.user;
    return true;
  } catch (e) {
    return false;
  }
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const page = hash || "dashboard";
  state.page = page;
  if (page === "login" || page === "register") {
    if (state.user) { navigate("dashboard"); return; }
    await mountPage(page);
    return;
  }
  if (!state.user) {
    const ok = await checkSession();
    if (!ok) { navigate("login"); return; }
  }
  await mountPage(page);
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);
