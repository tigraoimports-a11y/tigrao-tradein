-- Extensões para: operador, rastreio de preenchimento pelo cliente, vínculo com entrega
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS operador TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS cliente_dados_preenchidos JSONB;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS cliente_preencheu_em TIMESTAMPTZ;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS entrega_id UUID;

CREATE INDEX IF NOT EXISTS idx_link_compras_status ON link_compras(status);
CREATE INDEX IF NOT EXISTS idx_link_compras_entrega_id ON link_compras(entrega_id);
