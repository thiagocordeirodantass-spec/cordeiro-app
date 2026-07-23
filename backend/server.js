// =============================================================================
//  server.js — bootstrap
//  -----------------------------------------------------------------------------
//  Detecta se --experimental-sqlite é necessário e reinicia com a flag.
//  Roda migrations, seed do admin padrão e inicia o servidor HTTP.
// =============================================================================
import { fileURLToPath } from "url";
import path from "path";
import { createApp } from "./app.js";
import { runSeed } from "./db/seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Garante que node:sqlite está disponível — caso contrário, reinicia com a flag.
try {
  await import("node:sqlite");
} catch (e) {
  if (!process.env.__SQLITE_REEXEC__) {
    console.log("Ativando suporte a SQLite (reiniciando com --experimental-sqlite)...");
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      process.execPath,
      ["--experimental-sqlite", ...process.argv.slice(1)],
      { stdio: "inherit", env: { ...process.env, __SQLITE_REEXEC__: "1" } }
    );
    process.exit(result.status ?? 1);
  } else {
    console.error("");
    console.error("[ERRO] Nao foi possivel carregar o modulo nativo 'node:sqlite'.");
    console.error("Requisito: Node.js 22.5 ou superior (recomendado: LTS mais recente).");
    console.error("Baixe em: https://nodejs.org/");
    console.error("");
    process.exit(1);
  }
}

// Migração do schema (idempotente) + seed
import("./db/index.js").then(({ db }) => {
  void db;
  runSeed(console.log);
}).catch((e) => {
  console.error("[ERRO] Falha ao inicializar banco:", e);
  process.exit(1);
});

const app = createApp();

app.listen(PORT, () => {
  console.log("");
  console.log("=================================================================");
  console.log(`  CT-e / NF-e Consulta - Backend rodando`);
  console.log(`  http://localhost:${PORT}`);
  console.log("=================================================================");
  console.log("  Endpoints principais (autenticacao por cookie de sessao):");
  console.log("    POST /api/auth/login      { username, password }");
  console.log("    POST /api/auth/logout");
  console.log("    GET  /api/auth/me");
  console.log("    GET  /api/health");
  console.log("    GET  /api/docs             (filtros: kind, status, uf, q, ...)");
  console.log("    POST /api/docs/import      { xml, kind, source }");
  console.log("    POST /api/docs/upload      (multipart)");
  console.log("    GET  /api/docs/:id/pdf     (PDF resumo)");
  console.log("    DEL  /api/docs/:id");
  console.log("    GET  /api/dashboard/{kpis,por-mes,por-uf,top-parceiros,por-status}");
  console.log("    GET  /api/relatorio/campos         (lista 147 colunas disponiveis)");
  console.log("    GET  /api/relatorio/{xlsx,csv,pdf,lote}  ?campos=chave,emitCNPJ,vNF,...");
  console.log("    CRUD /api/relatorio/templates");
  console.log("    GET  /api/relatorio/historico");
  console.log("    POST /api/sefaz/cert/lote  (cert A1, por chave)");
  console.log("    POST /api/sefaz/cert/periodo  (cert A1, por NSU)");
  console.log("    GET/POST /api/sefaz/provedor/config  POST /api/sefaz/provedor/lote");
  console.log("    GET/POST /api/meudanfe/config");
  console.log("    POST /api/meudanfe/xml-para-pdf   GET /api/meudanfe/chave/:chave/{xml,pdf}");
  console.log("    GET  /api/consulta/nfe/:chave    GET /api/consulta/cte/:chave");
  console.log("    GET  /api/chave/validar/:chave");
  console.log("    POST /api/generate/{nfe,cte}");
  console.log("=================================================================");
  console.log("  Aviso: este backend NAO assina XML e NAO transmite a SEFAZ.");
  console.log("  Use um emissor homologado (ACBr, NFePHP) e importe o XML processado.");
  console.log("=================================================================");
  console.log("");
});
