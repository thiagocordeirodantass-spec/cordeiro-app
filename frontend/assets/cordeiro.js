// =============================================================================
//  assets/cordeiro.js — SVG inline do cordeiro (marca do sistema)
// =============================================================================

// SVG do cordeiro — silhueta estilizada com lã encaracolada
export const CORDEIRO_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Cordeiro">
  <!-- Cabelo (lã encaracolada) — 5 bolinhas brancas em volta -->
  <g fill="#fafaf7" stroke="#1c1917" stroke-width="1.5">
    <circle cx="20" cy="18" r="9"/>
    <circle cx="32" cy="14" r="9"/>
    <circle cx="44" cy="18" r="9"/>
    <circle cx="14" cy="28" r="9"/>
    <circle cx="50" cy="28" r="9"/>
    <circle cx="22" cy="30" r="8"/>
    <circle cx="42" cy="30" r="8"/>
  </g>
  <!-- Cabeça do cordeiro -->
  <ellipse cx="32" cy="38" rx="11" ry="10" fill="#1c1917"/>
  <!-- Orelhas -->
  <ellipse cx="22" cy="34" rx="3" ry="5" fill="#1c1917" transform="rotate(-25 22 34)"/>
  <ellipse cx="42" cy="34" rx="3" ry="5" fill="#1c1917" transform="rotate(25 42 34)"/>
  <!-- Olhos -->
  <circle cx="28" cy="38" r="1.5" fill="#fafaf7"/>
  <circle cx="36" cy="38" r="1.5" fill="#fafaf7"/>
  <!-- Focinho -->
  <ellipse cx="32" cy="43" rx="2.5" ry="2" fill="#78716c"/>
  <!-- Pernas -->
  <rect x="22" y="50" width="3" height="8" fill="#1c1917" rx="1"/>
  <rect x="28" y="50" width="3" height="8" fill="#1c1917" rx="1"/>
  <rect x="33" y="50" width="3" height="8" fill="#1c1917" rx="1"/>
  <rect x="39" y="50" width="3" height="8" fill="#1c1917" rx="1"/>
  <!-- Rabo -->
  <circle cx="54" cy="24" r="4" fill="#fafaf7" stroke="#1c1917" stroke-width="1.5"/>
</svg>
`;

// Logo + nome (usado no shell lateral, login, etc)
export function logoCordeiro(size = "md", withText = true) {
  const cls = size === "lg" ? "logo-cordeiro logo-cordeiro--lg"
            : size === "xl" ? "logo-cordeiro logo-cordeiro--xl"
            : "logo-cordeiro";
  const wrap = document.createElement("div");
  wrap.className = cls;
  const svg = document.createElement("span");
  svg.style.display = "inline-flex";
  svg.innerHTML = CORDEIRO_SVG;
  wrap.appendChild(svg);
  if (withText) {
    const text = document.createElement("span");
    text.className = "text";
    const h = document.createElement(size === "xl" ? "h1" : "h2");
    h.textContent = "Cordeiro";
    const small = document.createElement("small");
    small.textContent = "Sistema Fiscal";
    text.appendChild(h);
    text.appendChild(small);
    wrap.appendChild(text);
  }
  return wrap;
}

// Ícones SVG inline para o menu lateral
export const ICONS = {
  dashboard: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  documents: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
  import: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  portal: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  sefaz: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  meudanfe: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="12" cy="14" r="2"/></svg>',
  relatorios: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  templates: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
  audit: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  users: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  exit: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  news: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8M10 10h8"/></svg>',
  feedback: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h6"/></svg>',
};

// Banner "Em desenvolvimento" — exibido no topo de todas as páginas
export function devBanner() {
  const div = document.createElement("div");
  div.className = "dev-banner";
  div.innerHTML = '<span class="dev-pill">em desenvolvimento</span> <span>O sistema está em fase de testes — use com atenção. Em caso de dúvidas, contate o administrador.</span>';
  return div;
}
