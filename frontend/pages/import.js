// =============================================================================
//  pages/import.js — upload / paste de XML
// =============================================================================
import { api, toast, el } from "../assets/app.js";

export async function render(root) {
  root.appendChild(el("div", { class: "topbar" }, el("div", { class: "crumbs" }, el("strong", {}, "Importar XML"))));

  const grid = el("div", { style: "display:grid; grid-template-columns:1fr 1fr; gap:16px" });
  root.appendChild(grid);

  // ---- Card 1: Paste ----
  const pasteArea = el("textarea", { placeholder: "Cole aqui o conteúdo do XML…" });
  const pasteBtn = el("button", { class: "btn btn--primary" }, "Importar XML colado");
  const pasteStatus = el("div", { class: "kv__value", style: "margin-top:10px" });
  pasteBtn.onclick = async () => {
    const xml = pasteArea.value.trim();
    if (!xml) { pasteStatus.textContent = "Cole o XML primeiro."; return; }
    pasteBtn.disabled = true;
    try {
      const r = await api("/api/docs/import", { method: "POST", body: { xml, source: "paste" } });
      if (r.ok) {
        pasteStatus.textContent = `OK — ${r.kind} número ${r.summary?.numero || "-"} (chave ${r.chave})`;
        toast("Documento importado!");
        pasteArea.value = "";
      } else { pasteStatus.textContent = r.error || "Falha ao importar."; }
    } catch (e) { pasteStatus.textContent = e.message; }
    pasteBtn.disabled = false;
  };
  grid.appendChild(card("Colar XML", el("div", {}, pasteArea, el("div", { style: "margin-top:10px" }, pasteBtn), pasteStatus)));

  // ---- Card 2: Upload ----
  const fileInput = el("input", { class: "input", type: "file", multiple: "true", accept: ".xml" });
  const uploadBtn = el("button", { class: "btn btn--primary" }, "Enviar arquivos");
  const uploadStatus = el("div", { class: "kv__value", style: "margin-top:10px" });
  uploadBtn.onclick = async () => {
    const files = fileInput.files;
    if (!files.length) { uploadStatus.textContent = "Selecione ao menos 1 arquivo."; return; }
    uploadBtn.disabled = true;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      const r = await api("/api/docs/upload", { method: "POST", body: fd });
      const ok = r.processed.filter((x) => x.ok).length;
      const fail = r.processed.length - ok;
      uploadStatus.textContent = `${ok} importados, ${fail} com erro.`;
      toast(`${ok} documentos importados`);
      fileInput.value = "";
    } catch (e) { uploadStatus.textContent = e.message; }
    uploadBtn.disabled = false;
  };
  grid.appendChild(card("Enviar arquivos .xml", el("div", {}, fileInput, el("div", { style: "margin-top:10px" }, uploadBtn), uploadStatus)));

  // ---- Card 3: Gerar XML de exemplo ----
  const num = el("input", { class: "input", type: "number", value: "1", placeholder: "Número" });
  const serie = el("input", { class: "input", type: "text", value: "1", placeholder: "Série" });
  const genNfe = el("button", { class: "btn" }, "Gerar XML NF-e");
  const genCte = el("button", { class: "btn" }, "Gerar XML CT-e");
  const out = el("textarea", { readonly: "true", style: "min-height:200px; font-size:11.5px" });
  const chaveOut = el("div", { class: "kv__value", style: "margin-top:8px" });
  async function gen(kind) {
    const r = await api(`/api/generate/${kind}`, { method: "POST", body: { numero: Number(num.value) || 1, serie: serie.value || "1" } });
    out.value = r.xml; chaveOut.textContent = `Chave: ${r.chave}`;
  }
  genNfe.onclick = () => gen("nfe");
  genCte.onclick = () => gen("cte");
  const genCard = card("Gerar XML (NF-e / CT-e) — não assina",
    el("div", { class: "row" },
      el("div", { class: "field" }, el("label", {}, "Número"), num),
      el("div", { class: "field" }, el("label", {}, "Série"), serie),
    ),
    el("div", { class: "row--inline", style: "margin-top:10px" }, genNfe, genCte),
    out, chaveOut,
  );
  grid.appendChild(genCard);
  grid.lastChild.style.gridColumn = "1 / -1";
}

function card(title, body) {
  return el("div", { class: "card" },
    el("div", { class: "card__head" }, el("h2", {}, title)),
    el("div", { class: "card__body" }, body),
  );
}
