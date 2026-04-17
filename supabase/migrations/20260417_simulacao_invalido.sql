-- Permite marcar simulacoes como INVALIDO (cliente nao elegivel pra troca)
-- com motivo estruturado, observacao livre e flag de resposta no WhatsApp.

-- Novas colunas (nao mexem em dados existentes)
ALTER TABLE simulacoes
  ADD COLUMN IF NOT EXISTS motivo_invalido TEXT,
  ADD COLUMN IF NOT EXISTS obs_invalido TEXT,
  ADD COLUMN IF NOT EXISTS respondido_wa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marcado_invalido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marcado_invalido_por TEXT;

-- Index pra filtrar rapido por status/invalido
CREATE INDEX IF NOT EXISTS idx_simulacoes_status_created ON simulacoes(status, created_at DESC);
