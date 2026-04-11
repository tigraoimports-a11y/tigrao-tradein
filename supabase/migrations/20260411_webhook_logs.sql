-- Tabela temporária para debug de webhooks Z-API
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT,
  payload TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
