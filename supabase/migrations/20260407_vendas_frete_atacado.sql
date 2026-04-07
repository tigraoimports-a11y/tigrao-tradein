-- Entrega cobrada à parte para vendas atacado
-- Ver doc de decisão: opção B (colunas na própria tabela vendas)

ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_valor numeric(10, 2);
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_recebido boolean DEFAULT false;

COMMENT ON COLUMN vendas.frete_valor IS 'Valor cobrado pelo serviço de entrega (atacado). NULL = sem entrega.';
COMMENT ON COLUMN vendas.frete_recebido IS 'Se o frete já foi pago pelo cliente.';

-- Index parcial pra agilizar o card do dashboard (vendas com frete)
CREATE INDEX IF NOT EXISTS idx_vendas_frete_data ON vendas (data) WHERE frete_valor IS NOT NULL AND frete_valor > 0;
