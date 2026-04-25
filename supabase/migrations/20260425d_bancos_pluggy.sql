-- Open Finance via Pluggy (Abr/2026 — item #28)
--
-- Substitui digitacao manual de saldos por sync automatico via Pluggy
-- (https://pluggy.ai), agregador BR que conecta Itau, Inter, MP, Nubank,
-- Bradesco etc usando Open Finance + scraping autorizado.
--
-- 2 tabelas:
-- - bancos_conexoes: 1 row por banco conectado (Pluggy chama de "item")
-- - bancos_saldos_historico: append-only, 1 row por consulta de saldo
--   permite grafico historico no futuro

CREATE TABLE IF NOT EXISTS bancos_conexoes (
  id BIGSERIAL PRIMARY KEY,
  -- ID do "item" no Pluggy (representa 1 conexao com 1 banco do usuario).
  -- 1 item pode ter varias contas (corrente + poupanca + cartao).
  pluggy_item_id TEXT NOT NULL UNIQUE,
  -- Alias amigavel pra mapear no nosso sistema:
  -- ITAU | INFINITE | MERCADO_PAGO | NUBANK | INTER | BRADESCO | CAIXA | OUTRO
  banco_alias TEXT NOT NULL,
  -- Nome legivel do banco (do Pluggy connector.name)
  banco_nome TEXT NOT NULL,
  -- Status da conexao: UPDATED | OUTDATED | LOGIN_ERROR | WAITING_USER_INPUT | etc
  -- Ver https://docs.pluggy.ai/docs/items
  status TEXT NOT NULL DEFAULT 'CREATED',
  -- Metadados do connector pra mostrar logo/cor na UI
  connector_id INT,
  connector_image_url TEXT,
  connector_primary_color TEXT,
  -- Sync info
  ultimo_sync_em TIMESTAMPTZ,
  ultimo_sync_status TEXT,
  ultimo_sync_erro TEXT,
  -- Ativo: false = admin desconectou (ainda existe no Pluggy mas nao usamos)
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bancos_conexoes_alias
  ON bancos_conexoes (banco_alias) WHERE ativo = TRUE;
CREATE INDEX IF NOT EXISTS idx_bancos_conexoes_status
  ON bancos_conexoes (status);

CREATE TABLE IF NOT EXISTS bancos_saldos_historico (
  id BIGSERIAL PRIMARY KEY,
  conexao_id BIGINT REFERENCES bancos_conexoes(id) ON DELETE CASCADE,
  -- Pluggy account ID (uma conexao pode ter varias contas)
  pluggy_account_id TEXT NOT NULL,
  -- Tipo de conta: BANK | CREDIT (cartao de credito vira "saldo negativo")
  account_type TEXT,
  -- Subtype: CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  account_subtype TEXT,
  -- Nome legivel (ex: "Conta Corrente", "Cartao Black")
  account_name TEXT,
  -- Saldo em reais. Pra cartao de credito = limite usado (positivo).
  saldo NUMERIC(12, 2) NOT NULL,
  -- Pra cartao de credito: limite total
  credit_limite NUMERIC(12, 2),
  -- Quando consultou
  consultado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- JSON cru do Pluggy pra debug/auditoria
  raw JSONB
);

CREATE INDEX IF NOT EXISTS idx_bancos_saldos_conexao
  ON bancos_saldos_historico (conexao_id, consultado_em DESC);
CREATE INDEX IF NOT EXISTS idx_bancos_saldos_data
  ON bancos_saldos_historico (consultado_em DESC);

COMMENT ON TABLE bancos_conexoes IS 'Conexoes Pluggy/Open Finance — 1 row por banco autorizado';
COMMENT ON TABLE bancos_saldos_historico IS 'Snapshot de saldos a cada sync — append-only pra grafico historico';
COMMENT ON COLUMN bancos_conexoes.pluggy_item_id IS 'ID do item no Pluggy. Usado pra todas operacoes da Pluggy API.';
COMMENT ON COLUMN bancos_saldos_historico.saldo IS 'Saldo em R$ — para conta corrente positivo, para CREDIT_CARD = uso atual';
