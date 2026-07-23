// =============================================================================
//  pages/portal-nacional.js — Wizard de 4 passos (Certificado → Empresa → Pasta → Baixar)
// =============================================================================
import { api, apiDownload, toast, el } from "../assets/app.js";
import { ICONS } from "../assets/cordeiro.js";

let state = {
  step: 1,
  cert: null,    // thumbprint ou "upload"
  uploadPfx: null,
  senha: "",
  cnpj: "",
  uf: "",
  pastaDestino: null,    // FileSystemDirectoryHandle
  pastaName: "",
  ultNSU: "0",
  dateFrom: "",
  dateTo: "",
  formato: "xml_pdf",
  modoAuditoria: false,
  resultados: null,
};

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" },
      el("strong", {}, "Portal Nacional"),
      el("span", { class: "mod-tag" }, "SEFAZ — DF-e"),
    ),
  ));

  let certs = [];
  try {
    const r = await api("/api/sefaz/cert/listar");
    certs = r.certificados || [];
  } catch (e) {}

  const main = el("div", { class: "fade-in" });
  root.appendChild(main);

  function render() {
    main.innerHTML = "";
    // Wizard
    main.appendChild(el("div", { class: "wizard" },
      wizStep(1, "Conectar certificado", state.step),
      el("span", { class: `arrow ${state.step > 1 ? "is-done" : ""}` }, "→"),
      wizStep(2, "Selecionar empresa", state.step),
      el("span", { class: `arrow ${state.step > 2 ? "is-done" : ""}` }, "→"),
      wizStep(3, "Pasta de destino", state.step),
      el("span", { class: `arrow ${state.step > 3 ? "is-done" : ""}` }, "→"),
      wizStep(4, "Baixar notas", state.step),
    ));

    const card = el("div", { class: "card card--mod", "data-mod": "portal" });
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
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "1️⃣ Conecte seu certificado digital")));
    const body = el("div", { class: "card__body" });
    body.appendChild(el("p", { class: "kv__label" },
      "Escolha o certificado digital do CNPJ/CPF que quer consultar."));

    if (certs.length) {
      const lista = el("div", { class: "dropzone" });
      for (const c of certs) {
        const opt = el("label", { style: "display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid var(--line); border-radius:6px; margin-bottom:6px; cursor:pointer" },
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
        lista.appendChild(opt);
      }
      body.appendChild(lista);
    } else {
      body.appendChild(el("div", { class: "empty" },
        "Nenhum certificado A1 detectado no Windows Store. Use a opção de upload abaixo."));
    }

    body.appendChild(el("p", { class: "kv__label", style: "margin-top:14px" }, "📂 Ou envie um .pfx / .p12"));
    const inpFile = el("input", { class: "input", type: "file", accept: ".pfx,.p12" });
    const lblFile = el("div", { class: "kv__label", style: "margin-top:6px" });
    inpFile.onchange = () => {
      if (inpFile.files?.[0]) {
        state.cert = "upload";
        state.uploadPfx = inpFile.files[0];
        lblFile.textContent = "✓ " + state.uploadPfx.name;
      }
    };
    body.appendChild(inpFile);
    body.appendChild(lblFile);

    const next = el("button", { class: "btn btn--primary btn--lg btn--block" }, "Próximo →");
    next.onclick = () => {
      if (!state.cert) { toast("Selecione um certificado do Windows ou envie um .pfx", "err"); return; }
      state.step = 2;
      render();
    };
    body.appendChild(el("div", { style: "margin-top:18px" }, next));
    card.appendChild(body);
  }

  function renderStep2(card) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "2️⃣ Confira a empresa")));
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

    body.appendChild(el("div", { class: "row" },
      el("div", { class: "field" }, el("label", {}, "Senha do certificado"), inpSenha),
      el("div", { class: "field" }, el("label", {}, "CNPJ"), inpCnpj),
      el("div", { class: "field" }, el("label", {}, "UF"), ufSel),
    ));

    // Mais opções
    const mais = el("details", { style: "margin-top:14px" },
      el("summary", { style: "cursor:pointer; font-weight:600" }, "⚙ Mais opções ▸"),
    );
    const inpDateFrom = el("input", { class: "input", type: "date", value: state.dateFrom });
    inpDateFrom.onchange = () => state.dateFrom = inpDateFrom.value;
    const inpDateTo = el("input", { class: "input", type: "date", value: state.dateTo });
    inpDateTo.onchange = () => state.dateTo = inpDateTo.value;
    const inpNSU = el("input", { class: "input", type: "text", placeholder: "0", value: state.ultNSU });
    inpNSU.onchange = () => state.ultNSU = inpNSU.value || "0";
    mais.appendChild(el("div", { style: "padding:10px 0" },
      el("div", { class: "row" },
        el("div", { class: "field" }, el("label", {}, "Data inicial"), inpDateFrom),
        el("div", { class: "field" }, el("label", {}, "Data final"), inpDateTo),
        el("div", { class: "field" }, el("label", {}, "Último NSU conhecido"), inpNSU),
      ),
    ));
    body.appendChild(mais);

    const back = el("button", { class: "btn" }, "← Voltar");
    back.onclick = () => { state.step = 1; render(); };
    const next = el("button", { class: "btn btn--primary btn--lg" }, "Próximo →");
    next.onclick = () => {
      if (!state.senha) { toast("Informe a senha do certificado", "err"); return; }
      if (!state.cnpj) { toast("Informe o CNPJ", "err"); return; }
      if (!state.uf) { toast("Selecione a UF", "err"); return; }
      state.step = 3;
      render();
    };
    body.appendChild(el("div", { style: "margin-top:18px; display:flex; gap:8px; justify-content:space-between" }, back, next));
    card.appendChild(body);
  }

  function renderStep3(card) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "3️⃣ Pasta de destino")));
    const body = el("div", { class: "card__body" });

    body.appendChild(el("p", { class: "kv__label" },
      "📌 Quando o Chrome pedir acesso à pasta, escolha \"Permitir em cada visita\" pra não precisar autorizar toda vez."));

    const drop = el("div", { class: "dropzone", id: "drop-pasta" },
      el("div", { class: "ico" }, "📁"),
      el("p", { id: "pasta-status" },
        state.pastaDestino
          ? `✓ ${state.pastaName} (pronta)`
          : "Cancelado — nenhuma pasta escolhida"
      ),
    );
    drop.onclick = async () => {
      try {
        if (window.showDirectoryPicker) {
          const handle = await window.showDirectoryPicker({ mode: "readwrite" });
          state.pastaDestino = handle;
          state.pastaName = handle.name;
          document.getElementById("pasta-status").textContent = "✓ " + handle.name;
        } else {
          toast("Seu navegador não suporta escolha de pasta. Use o modo ZIP (próximo passo).", "err");
        }
      } catch (e) { /* usuário cancelou */ }
    };
    body.appendChild(drop);

    // Opção ZIP como alternativa
    body.appendChild(el("details", { style: "margin-top:14px" },
      el("summary", { style: "cursor:pointer; font-weight:600" }, "📦 Sem pasta? Baixe como .zip ▸"),
      el("div", { style: "padding:10px 0" },
        el("p", { class: "kv__label" }, "Se o seu navegador não permite escolher pasta, você pode baixar tudo em um único .zip no passo 4."),
      ),
    ));

    const back = el("button", { class: "btn" }, "← Voltar");
    back.onclick = () => { state.step = 2; render(); };
    const next = el("button", { class: "btn btn--primary btn--lg" }, "Próximo →");
    next.onclick = () => { state.step = 4; render(); };
    body.appendChild(el("div", { style: "margin-top:18px; display:flex; gap:8px; justify-content:space-between" }, back, next));
    card.appendChild(body);
  }

  function renderStep4(card) {
    card.appendChild(el("div", { class: "card__head" }, el("h2", {}, "4️⃣ Baixe as notas")));
    const body = el("div", { class: "card__body" });
    body.appendChild(el("div", { class: "kv__label", style: "margin-bottom:12px" },
      "Incremental — baixa só o que é novo desde o último NSU."));

    // Formato
    const fmtSel = el("select", { class: "select" });
    for (const [v, lbl] of [["xml_pdf", "XML + PDF (DANFE)"], ["xml", "Apenas XML"], ["pdf", "Apenas PDF"]]) {
      const o = el("option", { value: v }, lbl);
      if (v === state.formato) o.selected = true;
      fmtSel.appendChild(o);
    }
    fmtSel.onchange = () => state.formato = fmtSel.value;
    body.appendChild(el("div", { class: "row" },
      el("div", { class: "field" }, el("label", {}, "Formato"), fmtSel),
      el("div", { class: "field" }, el("label", {}, "Modo"),
        el("label", { class: "checkbox" },
          el("input", { type: "checkbox", checked: state.modoAuditoria ? "true" : false, onChange: (e) => state.modoAuditoria = e.target.checked }),
          " Modo auditoria (destacar retenções)",
        ),
      ),
    ));

    // Botões
    const btnZip = el("button", { class: "btn btn--primary btn--lg btn--block" }, "📦 Baixar como ZIP");
    btnZip.onclick = () => fetchAndDownload(false);
    const btnPasta = el("button", { class: "btn btn--lg btn--block" }, "📁 Salvar direto na pasta escolhida");
    btnPasta.onclick = () => fetchAndDownload(true);
    if (!state.pastaDestino) btnPasta.disabled = true;
    body.appendChild(el("div", { style: "display:grid; gap:8px; margin-top:14px" }, btnZip, btnPasta));

    // Análise de lacunas
    body.appendChild(el("div", { style: "margin-top:18px; padding-top:14px; border-top:1px solid var(--line)" },
      el("h3", { style: "margin:0 0 8px" }, "🔍 Lacunas de NSU"),
      el("p", { class: "kv__label" }, "Mostra se faltou algum NSU na pasta."),
      el("button", { class: "btn", onClick: () => analisarLacunas() }, "Analisar lacunas"),
    ));

    const progress = el("div", { id: "portal-progress", style: "margin-top:14px" });
    body.appendChild(progress);
    card.appendChild(body);
  }

  async function fetchAndDownload(saveToFolder) {
    const progress = document.getElementById("portal-progress");
    progress.innerHTML = '<div class="progress indeterminate"><div class="bar"></div></div><div class="kv__value" style="margin-top:6px">Consultando SEFAZ…</div>';
    const fd = new FormData();
    if (state.uploadPfx) fd.append("certificado", state.uploadPfx);
    else fd.append("thumbprint", state.cert);
    fd.append("senha", state.senha);
    fd.append("cnpj", state.cnpj);
    fd.append("uf", state.uf);
    fd.append("formato", state.formato);
    fd.append("salvarNoBanco", "1");
    if (state.dateFrom) fd.append("dateFrom", state.dateFrom);
    if (state.dateTo) fd.append("dateTo", state.dateTo);
    fd.append("ultNSUInicial", state.ultNSU);
    try {
      const r = await fetch("/api/sefaz/cert/periodo", { method: "POST", body: fd, credentials: "same-origin" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        progress.innerHTML = '<div class="empty">❌ ' + (j.error || "HTTP " + r.status) + '</div>';
        return;
      }
      const salvos = r.headers.get("X-Sefaz-Salvos") || "0";
      const ultNSU = r.headers.get("X-Sefaz-UltNSU") || "0";
      const atingiuFim = r.headers.get("X-Sefaz-AtingiuFim") || "false";
      state.ultNSU = ultNSU;
      progress.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:10px">
          <div class="kpi kpi--success"><div class="kpi__label">Salvos no banco</div><div class="kpi__value">${salvos}</div></div>
          <div class="kpi kpi--accent"><div class="kpi__label">Último NSU</div><div class="kpi__value" style="font-size:18px">${ultNSU}</div></div>
          <div class="kpi"><div class="kpi__label">Fim alcançado</div><div class="kpi__value" style="font-size:18px">${atingiuFim === "true" ? "✓" : "—"}</div></div>
        </div>
      `;
      const blob = await r.blob();
      if (saveToFolder && state.pastaDestino) {
        // salvar arquivo por arquivo
        await extractZipToFolder(blob, state.pastaDestino);
        progress.appendChild(el("div", { class: "kv__value", style: "margin-top:8px" }, "✓ Arquivos salvos na pasta"));
      } else {
        const url = URL.createObjectURL(blob);
        const a = el("a", { href: url, download: `portal-nacional-${Date.now()}.zip` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        progress.appendChild(el("a", { href: "#/documents?source=sefaz-cert-periodo", class: "btn", style: "margin-top:6px" }, "→ Ver documentos salvos"));
      }
    } catch (e) {
      progress.innerHTML = '<div class="empty">❌ ' + e.message + '</div>';
    }
  }

  async function extractZipToFolder(blob, folderHandle) {
    // Extrai o zip e salva cada arquivo na pasta
    // Implementação simples usando JSZip-like inline
    const buf = await blob.arrayBuffer();
    const uint8 = new Uint8Array(buf);
    // Parsing ZIP mínimo (procura Local File Headers 0x04034b50)
    let i = 0;
    const files = [];
    while (i < uint8.length - 4) {
      if (uint8[i] === 0x50 && uint8[i+1] === 0x4b && uint8[i+2] === 0x03 && uint8[i+3] === 0x04) {
        const compressedSize = uint8[i+18] | (uint8[i+19] << 8) | (uint8[i+20] << 16) | (uint8[i+21] << 24);
        const filenameLen = uint8[i+26] | (uint8[i+27] << 8);
        const extraLen = uint8[i+28] | (uint8[i+29] << 8);
        const filename = String.fromCharCode(...uint8.slice(i+30, i+30+filenameLen));
        const dataStart = i + 30 + filenameLen + extraLen;
        const data = uint8.slice(dataStart, dataStart + compressedSize);
        files.push({ name: filename, data });
        i = dataStart + compressedSize;
      } else {
        i++;
      }
    }
    for (const f of files) {
      try {
        const parts = f.name.split("/");
        let cur = folderHandle;
        for (let p = 0; p < parts.length - 1; p++) {
          cur = await cur.getDirectoryHandle(parts[p], { create: true });
        }
        const fh = await cur.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(f.data);
        await w.close();
      } catch (e) { console.warn("skip", f.name, e.message); }
    }
  }

  async function analisarLacunas() {
    const progress = document.getElementById("portal-progress");
    if (!state.pastaDestino) { toast("Escolha uma pasta primeiro (volte para o passo 3)", "err"); return; }
    progress.innerHTML = '<div class="kv__value">Analisando…</div>';
    try {
      const arquivos = [];
      async function walk(handle, path) {
        for await (const [name, h] of handle.entries()) {
          if (h.kind === "file") arquivos.push({ path: path + "/" + name, name, handle: h });
          else if (h.kind === "directory") await walk(h, path + "/" + name);
        }
      }
      await walk(state.pastaDestino, "");
      const chaves = arquivos
        .map((a) => (a.name.match(/(\d{44})/) || [])[1])
        .filter(Boolean);
      const unicas = new Set(chaves);
      const dups = chaves.length - unicas.size;
      progress.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:8px">
          <div class="kpi"><div class="kpi__label">Arquivos</div><div class="kpi__value">${arquivos.length}</div></div>
          <div class="kpi kpi--success"><div class="kpi__label">Chaves únicas</div><div class="kpi__value">${unicas.size}</div></div>
          <div class="kpi kpi--warn"><div class="kpi__label">Duplicadas</div><div class="kpi__value">${dups}</div></div>
        </div>
        <p class="kv__label">${dups === 0 ? "✓ Sem duplicatas. Para detectar lacunas de NSU, faça uma nova consulta e compare com o último NSU esperado." : "⚠ Há " + dups + " chaves duplicadas."}</p>
      `;
    } catch (e) { progress.innerHTML = '<div class="empty">❌ ' + e.message + '</div>'; }
  }

  render();
}
