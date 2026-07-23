// =============================================================================
//  db/index.js — conexão SQLite (node:sqlite nativo) + migração do schema
// =============================================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch (e) {
  // Algumas versões do Node (22.5 a ~22.12) só liberam node:sqlite com a flag
  // --experimental-sqlite. O bootstrap (server.js) detecta e reinicia.
  throw e;
}

const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// Carrega e executa o schema (idempotente)
const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schemaSql);

// Migração leve: adiciona colunas que podem faltar em banco pré-existente.
// Mantém compatibilidade com installations que rodaram o v2 sem o xml_data.
function ensureColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
try { ensureColumn("documents", "xml_data", "TEXT"); } catch (e) { console.error("[migration] ensureColumn xml_data falhou:", e.message); }
try { ensureColumn("users", "avatar_path", "TEXT"); } catch (e) { console.error("[migration] ensureColumn avatar_path falhou:", e.message); }

export default db;
