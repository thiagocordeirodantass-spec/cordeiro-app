// =============================================================================
//  pages/meudanfe.js — Consulta MeuDANFe (front-end interativo com confirmação)
//  -----------------------------------------------------------------------------
//  Layout moderno com 3 botões grandes e modal de confirmação antes de cada ação.
// =============================================================================
import { api, toast, el, showModal } from "../assets/app.js";
import { CORDEIRO_SVG } from "../assets/cordeiro.js";

export async function render(root) {
  // --- Header ---
  root.appendChild(el("div", { class: "topbar" },
    el("div", { class: "crumbs" },
      el("strong", {}, "MeuDANFe API"),
      el("span", { class: "mod-tag" }, "CONSULTA RÁPIDA"),
    ),
  ));

  // Carrega config (mascarada) para mostrar status
  let cfg = { apiKeyConfigured: false };
  try { cfg = await api("/api/meudanfe/config"); } catch (e) {}

  const wrap = el("div", { class: "md-wrap" });
  root.appendChild(wrap);

  // ---- HERO: cordeiro + título + status da chave ----
  const hero = el("div", { class: "md-hero" },
    el("div", { class: "md-hero__logo", html: CORDEIRO_SVG }),
    el("div", {},
      el("h1", { class: "md-hero__title" }, "Consulte sua NF-e em segundos"),
      el("p", { class: "md-hero__sub" }, "Informe a chave de acesso de 44 dígitos e baixe o DANFE, XML ou apenas visualize os dados da nota fiscal."),
    ),
    el("div", { class: "md-hero__badge", class: cfg.apiKeyConfigured ? "md-badge md-badge--ok" : "md-badge md-badge--warn" },
      cfg.apiKeyConfigured ? "✓ Api-Key configurada" : "⚠ Api-Key não configurada"
    ),
  );
  wrap.appendChild(hero);

  // ============================================================
  // CARD 1 — Consulta por chave
  // ============================================================
  const chaveInput = el("input", {
    class: "md-input md-input--xl mono",
    placeholder: "0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000",
    maxlength: "59", // 44 dígitos + 10 espaços
    inputmode: "numeric",
  });
  const chaveCounter = el("div", { class: "md-counter" }, "0 / 44 dígitos");
  const chaveStatus = el("div", { class: "md-status" });

  // Formatador visual enquanto digita
  chaveInput.oninput = () => {
    const d = chaveInput.value.replace(/\D/g, "").slice(0, 44);
    const parts = [
      d.slice(0, 4),  d.slice(4, 8),   d.slice(8, 12),  d.slice(12, 16),
      d.slice(16, 20), d.slice(20, 24), d.slice(24, 28), d.slice(28, 32),
      d.slice(32, 36), d.slice(36, 40), d.slice(40, 44),
    ].filter(Boolean);
    chaveInput.value = parts.join(" ");
    chaveCounter.textContent = `${d.length} / 44 dígitos`;
    chaveCounter.classList.toggle("md-counter--ok", d.length === 44);
    chaveCounter.classList.toggle("md-counter--err", d.length > 0 && d.length !== 44);
  };

  // Botões grandes
  const btnConsultar = el("button", { class: "md-btn md-btn--primary md-btn--lg" },
    el("span", { class: "md-btn__icon" }, "🔍"),
    el("span", { class: "md-btn__text" },
      el("strong", {}, "Consultar nota fiscal"),
      el("small", {}, "Busca e mostra resumo da NF-e (não baixa nada)"),
    ),
  );
  const btnBaixarPdf = el("button", { class: "md-btn md-btn--purple md-btn--lg" },
    el("span", { class: "md-btn__icon" }, "📥"),
    el("span", { class: "md-btn__text" },
      el("strong", {}, "Baixar DANFE em PDF"),
      el("small", {}, "Consulta e faz download do PDF do DANFE"),
    ),
  );
  const btnBaixarXml = el("button", { class: "md-btn md-btn--teal md-btn--lg" },
    el("span", { class: "md-btn__icon" }, "📄"),
    el("span", { class: "md-btn__text" },
      el("strong", {}, "Baixar apenas o XML"),
      el("small", {}, "Consulta e faz download do XML da NF-e"),
    ),
  );

  // Validação e modal de confirmação
  function getChave() {
    const d = chaveInput.value.replace(/\D/g, "");
    return d.length === 44 ? d : null;
  }
  function showConfirmModal({ title, msg, icon, color, action }) {
    const chave = getChave();
    if (!chave) { chaveStatus.className = "md-status md-status--err"; chaveStatus.textContent = "⚠ A chave precisa ter 44 dígitos."; return; }
    chaveStatus.className = "md-status"; chaveStatus.textContent = "";
    showModal({
      title: title,
      body: el("div", { class: "md-confirm" },
        el("div", { class: "md-confirm__icon", style: `background:${color}20; color:${color}` }, icon),
        el("div", {},
          el("p", { class: "md-confirm__msg" }, msg),
          el("div", { class: "md-confirm__chave" },
            el("span", { class: "md-confirm__chave-label" }, "Chave de acesso:"),
            el("code", {}, chave),
          ),
        ),
      ),
      wide: false,
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          document.querySelector(".modal")?.remove();
          await action(chave);
        }}, "✓ Confirmar e executar"),
      ],
    });
  }

  // === Ação: Consultar (mostra resumo, sem download) ===
  btnConsultar.onclick = () => showConfirmModal({
    title: "🔍 Consultar NF-e",
    msg: "Vamos consultar esta nota fiscal na SEFAZ via MeuDANFe. Nenhum arquivo será baixado — você verá os dados principais (emitente, destinatário, valor, status).",
    icon: "🔍",
    color: "#0e7c66",
    action: async (chave) => {
      chaveStatus.className = "md-status"; chaveStatus.textContent = "Consultando na SEFAZ…";
      try {
        const r = await fetch("/api/meudanfe/chave/" + chave + "/resumo", { credentials: "same-origin" });
        const txt = await r.text();
        let j; try { j = JSON.parse(txt); } catch { j = { error: txt }; }
        if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
        showResumoModal(chave, j);
        chaveStatus.className = "md-status md-status--ok";
        chaveStatus.textContent = "✓ Consulta concluída. Veja os dados abaixo.";
      } catch (e) {
        chaveStatus.className = "md-status md-status--err";
        chaveStatus.textContent = "Erro: " + e.message;
        showSefazFallback(e.message, 502);
      }
    },
  });

  // === Ação: Baixar PDF ===
  btnBaixarPdf.onclick = () => showConfirmModal({
    title: "📥 Baixar DANFE (PDF)",
    msg: "Vamos consultar a NF-e e gerar o DANFE em PDF para download. O arquivo será salvo na sua pasta de downloads.",
    icon: "📥",
    color: "#7c3aed",
    action: async (chave) => {
      chaveStatus.className = "md-status"; chaveStatus.textContent = "Buscando XML e gerando PDF…";
      try {
        const r = await fetch("/api/meudanfe/chave/" + chave + "/pdf", { credentials: "same-origin" });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "HTTP " + r.status); }
        const blob = await r.blob();
        downloadBlob(blob, `danfe-${chave}.pdf`);
        chaveStatus.className = "md-status md-status--ok";
        chaveStatus.textContent = "✓ Download do PDF iniciado.";
      } catch (e) {
        chaveStatus.className = "md-status md-status--err";
        chaveStatus.textContent = "Erro: " + e.message;
        showSefazFallback(e.message, 502);
      }
    },
  });

  // === Ação: Baixar XML ===
  btnBaixarXml.onclick = () => showConfirmModal({
    title: "📄 Baixar XML",
    msg: "Vamos consultar a NF-e e baixar o XML bruto. O arquivo será salvo na sua pasta de downloads.",
    icon: "📄",
    color: "#0d9488",
    action: async (chave) => {
      chaveStatus.className = "md-status"; chaveStatus.textContent = "Buscando XML…";
      try {
        const r = await fetch("/api/meudanfe/chave/" + chave + "/xml", { credentials: "same-origin" });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "HTTP " + r.status); }
        const blob = await r.blob();
        downloadBlob(blob, `${chave}.xml`);
        chaveStatus.className = "md-status md-status--ok";
        chaveStatus.textContent = "✓ Download do XML iniciado.";
      } catch (e) {
        chaveStatus.className = "md-status md-status--err";
        chaveStatus.textContent = "Erro: " + e.message;
        showSefazFallback(e.message, 502);
      }
    },
  });

  // ---- Botão de colar (Ctrl+V) ----
  const btnPaste = el("button", { class: "md-paste", title: "Colar chave (Ctrl+V)" },
    el("span", { class: "md-paste__icon" }, "📋"),
    el("span", {}, "Colar"),
  );
  btnPaste.onclick = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const d = (txt || "").replace(/\D/g, "").slice(0, 44);
      if (d.length === 44) {
        chaveInput.value = d;
        chaveInput.oninput();
        chaveInput.focus();
        toast("✓ Chave colada");
      } else {
        toast("Nada de útil no clipboard (chave precisa ter 44 dígitos)", "err");
      }
    } catch (e) { toast("Permita acesso ao clipboard", "err"); }
  };

  // ---- Helper: mostra fallback para SEFAZ quando MeuDANFe não tem a nota ----
  function showSefazFallback(errorMsg, responseStatus) {
    // Detecta padrão "MeuDANFe não tem essa NF-e" — cobre:
    //  - erro explícito do backend com a mensagem característica
    //  - qualquer 502 (que é o status que o backend retorna pra falha de API)
    //  - body vazio com 502 (às vezes acontece quando o body é gigantesco)
    const isNotFound = /Nenhum endpoint|404|Not Found|nao encontrou|status 404/i.test(errorMsg || "")
      || responseStatus === 502
      || responseStatus === 404;
    if (!isNotFound) return;
    const chave = getChave();
    if (!chave) return;
    const fallback = el("div", { class: "md-fallback" },
      el("div", { class: "md-fallback__head" },
        el("span", {}, "💡"),
        el("strong", {}, "MeuDANFe não tem esta NF-e no cache deles"),
      ),
      el("p", { class: "md-fallback__msg" },
        "A nota não foi encontrada porque o MeuDANFe só consulta NF-e que ",
        el("strong", {}, "passaram pelo serviço deles"),
        " ou estão no cache. Para esta chave, você precisa consultar ",
        el("strong", {}, "diretamente na SEFAZ"),
        " usando o certificado A1 da empresa dona da NF-e."
      ),
      el("div", { class: "md-fallback__actions" },
        el("a", {
          class: "md-btn md-btn--orange md-btn--lg",
          href: "#/sefaz-download",
          onClick: (e) => {
            e.preventDefault();
            // Salva a chave para a página do SEFAZ usar
            sessionStorage.setItem("sefaz-preset-chaves", chave);
            location.hash = "#/sefaz-download";
          },
        },
          el("span", { class: "md-btn__icon" }, "🏛️"),
          el("span", { class: "md-btn__text" },
            el("strong", {}, "Tentar via SEFAZ com certificado A1"),
            el("small", {}, "Abre o wizard já com esta chave preenchida"),
          ),
        ),
        el("a", {
          class: "md-btn md-btn--teal md-btn--lg",
          href: "https://meudanfe.com.br/?chave=" + chave,
          target: "_blank", rel: "noopener noreferrer",
        },
          el("span", { class: "md-btn__icon" }, "🌐"),
          el("span", { class: "md-btn__text" },
            el("strong", {}, "Abrir no site do MeuDANFe"),
            el("small", {}, "Tenta consultar pela área logada deles"),
          ),
        ),
      ),
    );
    chaveStatus.innerHTML = "";
    chaveStatus.appendChild(fallback);
  }

  const card1 = el("div", { class: "card card--mod", "data-mod": "meudanfe" },
    el("div", { class: "card__head" },
      el("h2", {}, "1️⃣ Consulta por chave de acesso"),
    ),
    el("div", { class: "card__body" },
      el("div", { class: "md-field" },
        el("label", { class: "md-label" },
          "Chave de acesso (44 dígitos) ",
          btnPaste,
        ),
        chaveInput,
        chaveCounter,
      ),
      chaveStatus,
      el("div", { class: "md-btn-grid" }, btnConsultar, btnBaixarPdf, btnBaixarXml),
      el("p", { class: "md-hint" },
        el("strong", {}, "💡 Dica:"),
        " Após clicar, confirme a ação no modal. O sistema busca a nota na SEFAZ via API MeuDANFe.",
      ),
    ),
  );
  wrap.appendChild(card1);

  // ============================================================
  // CARD 2 — Upload de XML → PDF
  // ============================================================
  const fileInput = el("input", { class: "input", type: "file", accept: ".xml" });
  const btnUp = el("button", { class: "md-btn md-btn--primary" },
    el("span", { class: "md-btn__icon" }, "📤"),
    el("span", { class: "md-btn__text" },
      el("strong", {}, "Enviar XML e gerar DANFE PDF"),
    ),
  );
  const statUp = el("div", { class: "md-status" });
  btnUp.onclick = () => {
    if (!fileInput.files?.[0]) { statUp.className = "md-status md-status--err"; statUp.textContent = "Selecione um arquivo XML."; return; }
    const f = fileInput.files[0];
    showModal({
      title: "📤 Gerar DANFE a partir do XML",
      body: el("div", { class: "md-confirm" },
        el("div", { class: "md-confirm__icon", style: "background:#0e7c6620; color:#0e7c66" }, "📤"),
        el("div", {},
          el("p", { class: "md-confirm__msg" }, "O XML será enviado para o MeuDANFe, que retornará o DANFE em PDF."),
          el("div", { class: "md-confirm__chave" },
            el("span", { class: "md-confirm__chave-label" }, "Arquivo:"),
            el("code", {}, f.name + " (" + Math.round(f.size / 1024) + " KB)"),
          ),
        ),
      ),
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          document.querySelector(".modal")?.remove();
          statUp.className = "md-status"; statUp.textContent = "Enviando…";
          try {
            const fd = new FormData(); fd.append("file", f);
            const r = await fetch("/api/meudanfe/upload-para-pdf", { method: "POST", body: fd, credentials: "same-origin" });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "HTTP " + r.status); }
            const blob = await r.blob(); downloadBlob(blob, "danfe.pdf");
            statUp.className = "md-status md-status--ok"; statUp.textContent = "✓ DANFE baixado.";
          } catch (e) { statUp.className = "md-status md-status--err"; statUp.textContent = "Erro: " + e.message; }
        }}, "✓ Confirmar e enviar"),
      ],
    });
  };
  wrap.appendChild(el("div", { class: "card" },
    el("div", { class: "card__head" }, el("h2", {}, "2️⃣ Upload de XML — gerar DANFE")),
    el("div", { class: "card__body" },
      el("p", { class: "md-hint" }, "Já tem o XML salvo? Envie aqui e gere o DANFE em PDF na hora."),
      el("div", { class: "md-field" }, el("label", { class: "md-label" }, "Arquivo XML (.xml)"), fileInput),
      el("div", { style: "margin-top:10px" }, btnUp, statUp),
    ),
  ));

  // ============================================================
  // CARD 3 — Lote (várias chaves, paralelo)
  // ============================================================
  const chavesLote = el("textarea", { class: "md-input mono", placeholder: "Cole aqui as chaves (uma por linha)\n\nCada chave deve ter 44 dígitos.", style: "min-height:140px" });
  const chavesLoteCounter = el("div", { class: "md-counter" }, "0 chaves válidas");
  chavesLote.oninput = () => {
    const arr = chavesLote.value.split(/\r?\n/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length === 44);
    chavesLoteCounter.textContent = `${arr.length} chave${arr.length === 1 ? "" : "s"} válida${arr.length === 1 ? "" : "s"}`;
    chavesLoteCounter.classList.toggle("md-counter--ok", arr.length > 0);
  };
  const btnLote = el("button", { class: "md-btn md-btn--primary md-btn--lg" },
    el("span", { class: "md-btn__icon" }, "🚀"),
    el("span", { class: "md-btn__text" },
      el("strong", {}, "Envio em lote (paralelo)"),
      el("small", {}, "Processa várias NF-e de uma vez"),
    ),
  );
  const statLote = el("div", { class: "md-status" });
  const progressLote = el("div", { class: "md-lote" });
  btnLote.onclick = () => {
    const arr = chavesLote.value.split(/\r?\n/).map((s) => s.replace(/\D/g, "")).filter((s) => s.length === 44);
    if (!arr.length) { statLote.className = "md-status md-status--err"; statLote.textContent = "Cole ao menos uma chave de 44 dígitos."; return; }
    showModal({
      title: "🚀 Confirmar envio em lote",
      body: el("div", { class: "md-confirm" },
        el("div", { class: "md-confirm__icon", style: "background:#0e7c6620; color:#0e7c66" }, "🚀"),
        el("div", {},
          el("p", { class: "md-confirm__msg" }, `Vamos processar ${arr.length} NF-e em paralelo. Cada uma consultada na SEFAZ e salva como XML.`),
          el("div", { class: "md-confirm__chave" },
            el("span", { class: "md-confirm__chave-label" }, "Total de chaves:"),
            el("code", {}, String(arr.length)),
          ),
        ),
      ),
      footer: [
        el("button", { class: "btn", onClick: () => document.querySelector(".modal")?.remove() }, "Cancelar"),
        el("button", { class: "btn btn--primary", onClick: async () => {
          document.querySelector(".modal")?.remove();
          statLote.className = "md-status"; statLote.textContent = `Processando ${arr.length} chaves…`;
          progressLote.innerHTML = "";
          let ok = 0, err = 0;
          await Promise.allSettled(arr.map(async (chave) => {
            const linha = el("div", { class: "md-lote__line" },
              el("span", { class: "md-lote__icon" }, "⏳"),
              el("span", { class: "md-lote__chave" }, chave),
              el("span", { class: "md-lote__status" }, "buscando…"),
            );
            progressLote.appendChild(linha);
            try {
              const r = await fetch("/api/meudanfe/chave/" + chave + "/xml", { credentials: "same-origin" });
              if (!r.ok) throw new Error("HTTP " + r.status);
              ok++;
              linha.querySelector(".md-lote__icon").textContent = "✓";
              linha.querySelector(".md-lote__status").textContent = "OK";
              linha.classList.add("md-lote__line--ok");
            } catch (e) {
              err++;
              linha.querySelector(".md-lote__icon").textContent = "✗";
              linha.querySelector(".md-lote__status").textContent = e.message;
              linha.classList.add("md-lote__line--err");
            }
          }));
          statLote.className = ok ? "md-status md-status--ok" : "md-status md-status--err";
          statLote.textContent = `Concluído: ${ok} OK, ${err} erros.`;
        }}, `✓ Confirmar e processar ${arr.length} chaves`),
      ],
    });
  };
  wrap.appendChild(el("div", { class: "card" },
    el("div", { class: "card__head" }, el("h2", {}, "3️⃣ Envio em Lote")),
    el("div", { class: "card__body" },
      el("div", { class: "md-field" },
        el("label", { class: "md-label" }, "Chaves (uma por linha)"),
        chavesLote, chavesLoteCounter,
      ),
      el("div", { style: "margin-top:10px" }, btnLote, statLote),
      progressLote,
    ),
  ));
}

// =============================================================================
//  Helpers
// =============================================================================
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showResumoModal(chave, data) {
  const rows = [
    ["Chave", chave],
    ["Tipo", data.tipo || (chave.slice(20, 22) === "57" ? "CT-e" : "NF-e")],
    ["Número", data.numero || "—"],
    ["Série", data.serie || "—"],
    ["Emissão", data.dataEmissao || data.data || "—"],
    ["Emitente", data.emitenteNome || data.emitente || "—"],
    ["CNPJ Emitente", data.emitenteCnpj || "—"],
    ["Destinatário", data.destinatarioNome || data.destinatario || "—"],
    ["CNPJ Destinatário", data.destinatarioCnpj || "—"],
    ["Valor total", data.valorTotal ? Number(data.valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"],
    ["Status", data.status || "—"],
    ["Protocolo", data.protocolo || "—"],
  ];
  showModal({
    title: "📋 Dados da NF-e",
    body: el("div", {},
      el("div", { class: "md-resumo" },
        el("div", { class: "md-resumo__hero" },
          el("div", { class: "md-resumo__icon" }, "📄"),
          el("div", {},
            el("div", { class: "md-resumo__title" }, data.emitenteNome || "NF-e consultada"),
            el("div", { class: "md-resumo__sub" }, "Chave " + chave.slice(0, 4) + "…" + chave.slice(-4)),
          ),
        ),
        el("div", { class: "md-resumo__grid" },
          ...rows.map(([k, v]) => el("div", { class: "md-resumo__row" },
            el("span", { class: "md-resumo__label" }, k),
            el("span", { class: "md-resumo__value" }, String(v)),
          )),
        ),
      ),
    ),
    wide: true,
    footer: [
      el("button", { class: "btn", onClick: () => document.querySelector(".modal")?.remove() }, "Fechar"),
      el("button", { class: "btn", onClick: () => window.open(`https://meudanfe.com.br/?chave=${chave}`, "_blank") }, "🔍 Abrir no MeuDANFe"),
      el("button", { class: "btn btn--primary", onClick: async () => {
        document.querySelector(".modal")?.remove();
        const r = await fetch("/api/meudanfe/chave/" + chave + "/pdf", { credentials: "same-origin" });
        if (r.ok) { const b = await r.blob(); downloadBlob(b, `danfe-${chave}.pdf`); }
      }}, "📥 Baixar PDF"),
    ],
  });
}
