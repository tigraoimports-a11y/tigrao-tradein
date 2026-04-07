-- Vincular item de estoque à troca de origem (quando veio de uma operação de troca)
ALTER TABLE estoque
  ADD COLUMN IF NOT EXISTS troca_id UUID;
CREATE INDEX IF NOT EXISTS idx_estoque_troca_id ON estoque (troca_id);
