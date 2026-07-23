// =============================================================================
//  pages/sefaz-download.js — Wizard intuitivo para baixar NF-e do SEFAZ
//  -----------------------------------------------------------------------------
//  Fluxo:  1) Certificado → 2) Empresa/UF → 3) Chaves/Período → 4) Resultado
// =============================================================================
import { api, apiDownload, toast, el } from "../assets/app.js";
import { ICONS } from "../assets/cordeiro.js";

let state = {
  step: 1,
  cert: null,        // { thumbprint, label, vence } | "upload"
  uploadPfx: null,   // File
  senha: "",
  cnpj: "",
  uf: "",
  ambiente: "producao",
  formato: "xml_pdf",
  chaves: "",
  dateFrom: "",
  dateTo: "",
  modo: "chaves",    // "chaves" | "periodo"
};

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" },
      el("strong", {}, "Baixar do SEFAZ"),
      el("span", { class: "mod-tag" }, "SEFAZ A1"),
    ),
  ));

  // --- Detecta certificados ---
  let certs = [];
  try {
    const r = await api("/api/sefaz/cert/listar");
    certs = r.certificados || [];
  } catch (e) { /* silencioso */ }

  // --- Pré-preenche chave vinda do MeuDANFe (via sessionStorage) ---
  let presetChave = null;
  try {
    const saved = sessionStorage.getItem("sefaz-preset-chaves");
    if (saved && /^\d{44}$/.test(saved)) {
      presetChave = saved;
      state.chaves = saved;
      state.modo = "chaves";
      // Mostra aviso no topo
      const banner = el("div", { class: "md-fallback" },
        el("div", { class: "md-fallback__head" },
          el("span", {}, "🔗"),
          el("strong", {}, "Chave pré-preenchida — vinda da página MeuDANFe"),
        ),
        el("p", { class: "md-fallback__msg" },
          "Esta chave não foi encontrada no MeuDANFe. Vamos consultá-la diretamente na SEFAZ usando o certificado A1 que você selecionar. ",
          el("strong", {}, "Siga o wizard: certificado → empresa → chave → resultado."),
        ),
      );
      // será inserido dentro do main abaixo
      sessionStorage.removeItem("sefaz-preset-chaves");
      // Inserção postergada (precisa do main)
      setTimeout(() => {
        const main = root.querySelector(".fade-in");
        if (main && !main.querySelector(".md-fallback")) main.insertBefore(banner, main.firstChild);
      }, 50);
    }
  } catch (e) { /* silencioso */ }

  const main = el("div", { class: "fade-in" });
  root.appendChild(main);

  function renderWizard() {
    main.innerHTML = "";
    // Wizard (passo 1, 2, 3, 4)
    const wiz = el("div", { class: "wizard" },
      wizStep(1, "Certificado", state.step),
      el("span", { class: `arrow ${state.step > 1 ? "is-done" : ""}` }, "→"),
      wizStep(2, "Empresa/UF", state.step),
      el("span", { class: `arrow ${state.step > 2 ? "is-done" : ""}` }, "→"),
      wizStep(3, state.modo === "chaves" ? "Chaves" : "Período", state.step),
      el("span", { class: `arrow ${state.step > 3 ? "is-done" : ""}` }, "→"),
      wizStep(4, "Resultado", state.step),
    );
    main.appendChild(wiz);

    // Card do passo atual
    const card = el("div", { class: "card card--mod", "data-mod": "sefaz" });
    main.appendChild(card);

    if (state.step === 1) renderStep1(card, certs);
    else if (state.step === 2) renderStep2(card);
    else if (state.step === 3) renderStep3(card);
    else if (state.step === 4) renderStep4(card);
  }

  function wizStep(num, label, current) {
    const cls = num < current ? "is-done" : num === current ? "is-active" : "";
    return el("div", { class: `step ${cls}` },
      el("span", { class: "num" }, num < current ? "✓" : String(num)),
      el("span", {}, label),
    );
  }

  function renderStep1(card, certs) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "1️⃣ Selecione o certificado digital")));
    const body = el("div", { class: "card__body" });

    // Opção 1: certificado do Windows
    body.appendChild(el("p", { class: "kv__label" }, "📌 Certificados instalados no Windows (detectados automaticamente)"));
    if (certs.length) {
      const lista = el("div", { class: "dropzone" });
      const radios = [];
      for (const c of certs) {
        const opt = el("label", { style: "display:flex; align-items:center; gap:10px; padding:8px 12px; border:1px solid var(--line); border-radius:6px; margin-bottom:6px; cursor:pointer" },
          el("input", { type: "radio", name: "cert", value: c.thumbprint }),
          el("div", {},
            el("div", { style: "font-weight:600" }, c.label || c.subject),
            el("div", { class: "kv__label" }, `Vence em ${c.vence} • ${c.thumbprint.slice(0, 8)}…`),
          ),
        );
        opt.querySelector("input").onchange = () => {
          state.cert = c.thumbprint;
          state.uploadPfx = null;
        };
        radios.push(opt);
        lista.appendChild(opt);
      }
      body.appendChild(lista);
    } else {
      body.appendChild(el("div", { class: "empty" },
        "Nenhum certificado A1 detectado no Windows Store (Cert:\\CurrentUser\\My e Cert:\\LocalMachine\\My). Use a opção de upload abaixo."));
    }

    // Opção 2: upload .pfx/.p12
    body.appendChild(el("p", { class: "kv__label", style: "margin-top:18px" }, "📂 Ou envie um arquivo .pfx / .p12"));
    const inpFile = el("input", { class: "input", type: "file", accept: ".pfx,.p12" });
    inpFile.onchange = () => {
      if (inpFile.files?.[0]) {
        state.cert = "upload";
        state.uploadPfx = inpFile.files[0];
        lblFile.textContent = "✓ " + state.uploadPfx.name;
        // desmarca radios do Windows
        radios.forEach((r) => r.querySelector("input").checked = false);
      }
    };
    const lblFile = el("div", { class: "kv__label", style: "margin-top:6px" });
    body.appendChild(inpFile);
    body.appendChild(lblFile);

    // Botão
    const btnNext = el("button", { class: "btn btn--primary btn--lg btn--block" }, "Próximo →");
    btnNext.onclick = () => {
      if (!state.cert) { toast("Selecione um certificado do Windows ou envie um .pfx", "err"); return; }
      state.step = 2;
      renderWizard();
    };
    body.appendChild(el("div", { style: "margin-top:20px" }, btnNext));

    card.appendChild(body);
  }

  function renderStep2(card) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "2️⃣ Informe os dados da empresa")));
    const body = el("div", { class: "card__body" });

    const inpSenha = el("input", { class: "input", type: "password", placeholder: "Senha do certificado", value: state.senha });
    inpSenha.oninput = () => state.senha = inpSenha.value;
    const inpCnpj = el("input", { class: "input", placeholder: "CNPJ (só dígitos)", value: state.cnpj });
    inpCnpj.oninput = () => { state.cnpj = inpCnpj.value.replace(/\D/g, ""); inpCnpj.value = state.cnpj; };

    const ufSel = el("select", { class: "select" });
    for (const s of ["", "SP", "RJ", "MG", "RS", "PR", "SC", "BA", "PE", "CE", "GO", "DF", "ES", "MT", "MS", "PA", "PB", "RN", "AL", "PI", "SE", "MA", "TO", "AC", "AP", "AM", "RR", "RO"]) {
      const o = el("option", { value: s }, s || "UF");
      if (s === state.uf) o.selected = true;
      ufSel.appendChild(o);
    }
    ufSel.onchange = () => state.uf = ufSel.value;

    const ambSel = el("select", { class: "select" },
      el("option", { value: "producao" }, "Produção"),
      el("option", { value: "homologacao" }, "Homologação"),
    );
    if (state.ambiente) ambSel.value = state.ambiente;
    ambSel.onchange = () => state.ambiente = ambSel.value;

    body.appendChild(el("div", { class: "row" },
      el("div", { class: "field" }, el("label", {}, "Senha do certificado"), inpSenha),
      el("div", { class: "field" }, el("label", {}, "CNPJ"), inpCnpj),
      el("div", { class: "field" }, el("label", {}, "UF"), ufSel),
      el("div", { class: "field" }, el("label", {}, "Ambiente"), ambSel),
    ));

    const back = el("button", { class: "btn" }, "← Voltar");
    back.onclick = () => { state.step = 1; renderWizard(); };
    const next = el("button", { class: "btn btn--primary btn--lg" }, "Próximo →");
    next.onclick = () => {
      if (!state.senha) { toast("Informe a senha do certificado", "err"); return; }
      if (!state.cnpj || state.cnpj.length < 11) { toast("Informe o CNPJ/CPF", "err"); return; }
      if (!state.uf) { toast("Selecione a UF", "err"); return; }
      state.step = 3;
      renderWizard();
    };
    body.appendChild(el("div", { style: "margin-top:18px; display:flex; gap:8px; justify-content:space-between" }, back, next));
    card.appendChild(body);
  }

  function renderStep3(card) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "3️⃣ Escolha o que buscar")));
    const body = el("div", { class: "card__body" });

    // Modo: chaves | período
    const tabChaves = el("button", { class: `btn ${state.modo === "chaves" ? "btn--primary" : ""}`, onClick: () => { state.modo = "chaves"; renderWizard(); } }, "🔑 Por chaves");
    const tabPeriodo = el("button", { class: `btn ${state.modo === "periodo" ? "btn--primary" : ""}`, onClick: () => { state.modo = "periodo"; renderWizard(); } }, "📅 Por período (NSU)");
    body.appendChild(el("div", { style: "display:flex; gap:6px; margin-bottom:16px" }, tabChaves, tabPeriodo));

    if (state.modo === "chaves") {
      const ta = el("textarea", { class: "input", placeholder: "Cole as chaves de acesso (uma por linha)", style: "min-height:200px; font-family:monospace" }, state.chaves);
      ta.oninput = () => state.chaves = ta.value;
      body.appendChild(el("div", { class: "field" }, el("label", {}, `Chaves de acesso (44 dígitos) — ${state.chaves.split(/\r?\n/).filter((s) => s.replace(/\D/g, "").length === 44).length} válidas`), ta));
    } else {
      const inpFrom = el("input", { class: "input", type: "date", value: state.dateFrom });
      inpFrom.onchange = () => state.dateFrom = inpFrom.value;
      const inpTo = el("input", { class: "input", type: "date", value: state.dateTo });
      inpTo.onchange = () => state.dateTo = inpTo.value;
      body.appendChild(el("div", { class: "row" },
        el("div", { class: "field" }, el("label", {}, "Data inicial"), inpFrom),
        el("div", { class: "field" }, el("label", {}, "Data final"), inpTo),
      ));
      body.appendChild(el("p", { class: "kv__label", style: "margin-top:10px" },
        "O sistema busca TODOS os documentos no período via NSU incremental. Arquivos grandes podem demorar."));
    }

    // Formato
    const fmtSel = el("select", { class: "select" });
    for (const [v, lbl] of [["xml_pdf", "XML + PDF (DANFE)"], ["xml", "Apenas XML"], ["pdf", "Apenas PDF (DANFE)"]]) {
      const o = el("option", { value: v }, lbl);
      if (v === state.formato) o.selected = true;
      fmtSel.appendChild(o);
    }
    fmtSel.onchange = () => state.formato = fmtSel.value;
    body.appendChild(el("div", { class: "row", style: "margin-top:14px" },
      el("div", { class: "field" }, el("label", {}, "Formato do download"), fmtSel),
    ));

    const back = el("button", { class: "btn" }, "← Voltar");
    back.onclick = () => { state.step = 2; renderWizard(); };
    const next = el("button", { class: "btn btn--primary btn--lg" }, "🚀 Consultar SEFAZ e salvar →");
    next.onclick = () => {
      if (state.modo === "chaves") {
        const lista = state.chaves.split(/\r?\n/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length === 44);
        if (!lista.length) { toast("Cole ao menos uma chave de 44 dígitos", "err"); return; }
      }
      state.step = 4;
      renderWizard();
      doFetch();
    };
    body.appendChild(el("div", { style: "margin-top:20px; display:flex; gap:8px; justify-content:space-between" }, back, next));
    card.appendChild(body);
  }

  function renderStep4(card) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "4️⃣ Resultado da consulta")));
    const body = el("div", { class: "card__body" });
    body.appendChild(el("div", { id: "sefaz-progress" },
      el("div", { class: "progress indeterminate", style: "margin-bottom:14px" }, el("div", { class: "bar" })),
      el("div", { class: "kv__value" }, "Consultando SEFAZ em paralelo…"),
    ));
    const linkList = el("div", { style: "margin-top:14px" });
    body.appendChild(linkList);
    card.appendChild(body);
  }

  async function doFetch() {
    const progress = document.getElementById("sefaz-progress");
    if (!progress) return;
    const lista = state.chaves.split(/\r?\n/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length === 44);

    // Tenta o endpoint "lote" (manda todas as chaves e recebe um .zip com tudo + headers)
    if (state.modo === "chaves" && lista.length) {
      const fd = new FormData();
      if (state.uploadPfx) fd.append("certificado", state.uploadPfx);
      else fd.append("thumbprint", state.cert);
      fd.append("senha", state.senha);
      fd.append("cnpj", state.cnpj);
      fd.append("uf", state.uf);
      fd.append("ambiente", state.ambiente);
      fd.append("formato", state.formato);
      fd.append("salvarNoBanco", "1");
      fd.append("chaves", lista.join("\n"));
      try {
        const r = await fetch("/api/sefaz/cert/lote", { method: "POST", body: fd, credentials: "same-origin" });
        if (r.ok) {
          const ok = r.headers.get("X-Sefaz-Ok") || "0";
          const salvos = r.headers.get("X-Sefaz-Salvos") || "0";
          const jaExistiam = r.headers.get("X-Sefaz-Ja-Existentes") || "0";
          const erros = r.headers.get("X-Sefaz-Erros") || "0";
          const salvosIds = r.headers.get("X-Sefaz-Salvos-Ids") || "";
          progress.innerHTML = `
            <div class="kpi-grid" style="grid-template-columns:repeat(4, 1fr); margin-bottom:14px">
              <div class="kpi kpi--success"><div class="kpi__label">OK</div><div class="kpi__value">${ok}</div></div>
              <div class="kpi kpi--accent"><div class="kpi__label">Salvos</div><div class="kpi__value">${salvos}</div></div>
              <div class="kpi"><div class="kpi__label">Já existiam</div><div class="kpi__value">${jaExistiam}</div></div>
              <div class="kpi kpi--warn"><div class="kpi__label">Erros</div><div class="kpi__value">${erros}</div></div>
            </div>
          `;
          // download do .zip
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const a = el("a", { href: url, download: `sefaz-${Date.now()}.zip`, class: "btn btn--primary btn--lg" }, "📥 Baixar ZIP com XMLs/PDFs");
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          if (Number(salvos) > 0) {
            const link = el("a", { href: "#/documents?source=sefaz-cert", class: "btn", style: "margin-left:8px" }, "→ Ver documentos salvos na aba Documentos");
            progress.appendChild(link);
          }
          return;
        }
        const j = await r.json().catch(() => ({}));
        progress.innerHTML = '<div class="empty">❌ ' + (j.error || "HTTP " + r.status) + '</div>';
      } catch (e) {
        progress.innerHTML = '<div class="empty">❌ ' + e.message + '</div>';
      }
    } else {
      // período
      const fd = new FormData();
      if (state.uploadPfx) fd.append("certificado", state.uploadPfx);
      else fd.append("thumbprint", state.cert);
      fd.append("senha", state.senha);
      fd.append("cnpj", state.cnpj);
      fd.append("uf", state.uf);
      fd.append("ambiente", state.ambiente);
      fd.append("formato", state.formato);
      fd.append("salvarNoBanco", "1");
      fd.append("dateFrom", state.dateFrom);
      fd.append("dateTo", state.dateTo);
      try {
        const r = await fetch("/api/sefaz/cert/periodo", { method: "POST", body: fd, credentials: "same-origin" });
        if (r.ok) {
          const salvos = r.headers.get("X-Sefaz-Salvos") || "0";
          const ultNSU = r.headers.get("X-Sefaz-UltNSU") || "0";
          progress.innerHTML = `<div class="kpi-grid" style="grid-template-columns:repeat(2, 1fr); margin-bottom:14px">
            <div class="kpi kpi--accent"><div class="kpi__label">Salvos</div><div class="kpi__value">${salvos}</div></div>
            <div class="kpi"><div class="kpi__label">Último NSU</div><div class="kpi__value" style="font-size:18px">${ultNSU}</div></div>
          </div>`;
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const a = el("a", { href: url, download: `sefaz-periodo-${Date.now()}.zip`, class: "btn btn--primary btn--lg" }, "📥 Baixar ZIP");
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          return;
        }
        const j = await r.json().catch(() => ({}));
        progress.innerHTML = '<div class="empty">❌ ' + (j.error || "HTTP " + r.status) + '</div>';
      } catch (e) {
        progress.innerHTML = '<div class="empty">❌ ' + e.message + '</div>';
      }
    }
  }

  renderWizard();
}
