-- SKU canônico — Fase 1: adiciona coluna sku (TEXT NULLABLE) nas tabelas de
-- produto. Backfill é feito via script Node (scripts/backfill-sku.mjs) que
-- usa lib/sku.ts pra gerar o SKU baseado em modelo+storage+cor+specs.
--
-- Por enquanto NULLABLE — quando chegar em ~95% de cobertura, viramos NOT NULL.
--
-- Tabelas nessa fase:
--   estoque              — produto físico individual
--   loja_variacoes       — variação do mostruário público
--   avaliacao_usados     — tabela de valores base de trade-in (sem cor)
--
-- Fase 2 (próximo PR): vendas, simulacoes, link_compras, encomendas.

ALTER TABLE estoque
  ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE loja_variacoes
  ADD COLUMN IF NOT EXISTS sku TEXT;

ALTER TABLE avaliacao_usados
  ADD COLUMN IF NOT EXISTS sku TEXT;

-- Índices pra busca rápida por SKU (não unique ainda — backfill pode duplicar)
CREATE INDEX IF NOT EXISTS idx_estoque_sku ON estoque(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loja_variacoes_sku ON loja_variacoes(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_avaliacao_usados_sku ON avaliacao_usados(sku) WHERE sku IS NOT NULL;
