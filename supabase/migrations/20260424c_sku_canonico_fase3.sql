-- SKU canonico — Fase 3: estende a coluna `sku` (TEXT NULLABLE) pra todas as
-- tabelas transacionais que registram um produto, fechando o circuito ponta-a-ponta:
--
--   vendas           — registro da venda fechada (entra no estoque por estoque_id)
--   encomendas       — produto que cliente pediu pra trazer (estoque_id quando chega)
--   link_compras     — link gerado pra cliente preencher dados/pagar (produto)
--   simulacoes       — simulacao de troca (modelo_usado + storage_usado)
--   avisos_clientes  — cliente pediu aviso quando produto X chegar
--
-- Backfill via /api/admin/sku/backfill (POST). Em vendas/encomendas, prefere
-- copiar do estoque vinculado quando estoque.sku ja existe. Senao gera pelo
-- texto livre do produto via lib/sku.ts.
--
-- Cobertura final esperada: ~95%+ em vendas/encomendas/link_compras/simulacoes
-- (modelos Apple bem-cadastrados). Avisos pode ficar mais baixo (texto livre
-- do cliente, sem garantia de formato).
--
-- Quando atingir 100% nas tabelas operacionais, avaliamos NOT NULL + UNIQUE
-- onde fizer sentido.

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE encomendas
  ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE simulacoes
  ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE avisos_clientes
  ADD COLUMN IF NOT EXISTS sku TEXT;

-- Indices parciais (so linhas com sku) pra performance de:
--   - dashboard "Top SKUs vendidos"     → vendas(sku)
--   - lookup encomenda → estoque        → encomendas(sku)
--   - relatorio funil por SKU           → link_compras(sku), simulacoes(sku)
--   - matching aviso → estoque          → avisos_clientes(sku)
CREATE INDEX IF NOT EXISTS idx_vendas_sku ON vendas(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_encomendas_sku ON encomendas(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_link_compras_sku ON link_compras(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_simulacoes_sku ON simulacoes(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_avisos_clientes_sku ON avisos_clientes(sku) WHERE sku IS NOT NULL;
