-- Vincular venda a entrega (bidirecional):
-- - entregas.venda_id ja existe
-- - adicionar vendas.entrega_id pra facilitar a UI (esconder botao Encaminhar
--   quando ja tem entrega, mostrar botao Ver Entrega, status sincronizado)

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS entrega_id UUID;

CREATE INDEX IF NOT EXISTS idx_vendas_entrega_id ON vendas(entrega_id);

-- Backfill: preenche entrega_id em vendas que ja tem entrega vinculada via
-- entregas.venda_id. Evita estado inconsistente pra vendas antigas.
UPDATE vendas v
SET entrega_id = e.id
FROM entregas e
WHERE e.venda_id = v.id
  AND v.entrega_id IS NULL;
