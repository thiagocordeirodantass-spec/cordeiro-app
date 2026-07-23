-- =============================================================================
--  Schema do banco (SQLite, via node:sqlite)
--  -----------------------------------------------------------------------------
--  Todas as tabelas usam IF NOT EXISTS para serem idempotentes.
--  Tabelas originais do projeto (documents, logs) ficam como estavam.
--  Tabelas novas para a v2: users, sessions, relatorio_templates, relatorio_historico.
-- =============================================================================

-- Documentos fiscais (NF-e, CT-e, NFC-e) — original
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,             -- 'NFE' | 'CTE' | 'NFCE' | 'OUTROS'
  modelo TEXT,                    -- '55' | '57' | '65'
  chave TEXT UNIQUE,              -- 44 digitos
  numero TEXT,
  serie TEXT,
  data_emissao TEXT,
  uf_emitente TEXT,
  uf_destino TEXT,
  remetente_nome TEXT,
  remetente_doc TEXT,
  destinatario_nome TEXT,
  destinatario_doc TEXT,
  valor_total TEXT,
  status TEXT,                    -- 'autorizado' | 'cancelado' | 'denegado' | 'pendente' | 'rejeitado'
  protocolo TEXT,
  xml_path TEXT NOT NULL,
  xml_size INTEGER,
  source TEXT,                    -- 'upload' | 'paste' | 'portal-nfe' | 'portal-cte' | 'generated'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- dump completo dos campos extraidos do XML (destrinchado no import)
  -- permite gerar relatorios com qualquer campo do XML sem precisar reprocessar
  xml_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_docs_kind ON documents(kind);
CREATE INDEX IF NOT EXISTS idx_docs_chave ON documents(chave);
CREATE INDEX IF NOT EXISTS idx_docs_data ON documents(data_emissao);
CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);

-- Log genérico de operações — original
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  payload TEXT,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
--  v2 — usuários, sessões, templates e auditoria
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,        -- scrypt (Node crypto nativo)
  password_salt TEXT NOT NULL,        -- hex
  role TEXT NOT NULL CHECK(role IN ('admin','operador','visualizador')),
  ativo INTEGER NOT NULL DEFAULT 1,
  primeiro_login INTEGER NOT NULL DEFAULT 0,  -- força troca de senha
  ultimo_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                -- token aleatorio 32 bytes hex
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS relatorio_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  campos TEXT NOT NULL,               -- JSON: lista de chaves de COLUNAS_DISPONIVEIS
  filtros TEXT,                       -- JSON
  incluir_itens INTEGER NOT NULL DEFAULT 0,
  compartilhar INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON relatorio_templates(user_id);

CREATE TABLE IF NOT EXISTS relatorio_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,                      -- denormalizado para preservar após exclusão
  template_id INTEGER REFERENCES relatorio_templates(id) ON DELETE SET NULL,
  formato TEXT NOT NULL,              -- 'xlsx' | 'csv' | 'pdf' | 'zip'
  filtros TEXT,                       -- JSON
  total_docs INTEGER NOT NULL,
  tamanho_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_historico_user ON relatorio_historico(user_id);
CREATE INDEX IF NOT EXISTS idx_historico_data ON relatorio_historico(created_at);

-- =============================================================================
--  v2.1 — verificação de email, foto de perfil
-- =============================================================================

-- Códigos de verificação de email (cadastro de novos usuários)
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  nome TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  codigo TEXT NOT NULL,            -- 6 dígitos
  tentativas INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verif_email ON email_verifications(email);

-- Foto de perfil (path relativo em data/avatars/)
-- (a coluna avatar_path é adicionada via ensureColumn em db/index.js)

-- =============================================================================
--  v2.2 — chat de feedback dos usuários para os devs
-- =============================================================================

-- Mensagens de feedback (sugestões, bugs, pedidos de melhoria)
-- Qualquer usuário autenticado pode enviar; admins visualizam/respondem
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- NULL se era anônimo ou conta foi excluída
  username TEXT NOT NULL,              -- denormalizado: preserva autor mesmo após exclusão
  categoria TEXT NOT NULL,             -- 'bug' | 'melhoria' | 'implementacao' | 'duvida' | 'outro'
  assunto TEXT,                        -- linha de assunto curta
  mensagem TEXT NOT NULL,              -- texto completo
  anonimo INTEGER NOT NULL DEFAULT 0,  -- se 1, esconde o username na listagem
  status TEXT NOT NULL DEFAULT 'aberto', -- 'aberto' | 'em_analise' | 'resolvido' | 'rejeitado'
  resposta TEXT,                       -- resposta do dev/admin
  respondido_por TEXT,                 -- username do dev que respondeu (denormalizado)
  respondido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_data ON feedback(created_at);
