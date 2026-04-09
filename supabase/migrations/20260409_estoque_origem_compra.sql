-- Adiciona campo origem_compra no estoque
-- Indica de onde o produto foi comprado: EUA, PARAGUAI, SAO_PAULO, RJ
-- Usado pra agrupar "Produtos A Caminho" por origem e estimar prazo de chegada
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS origem_compra TEXT;

-- Adiciona comentário na coluna
COMMENT ON COLUMN estoque.origem_compra IS 'Origem da compra: EUA (25-30 dias), PARAGUAI (15 dias), SAO_PAULO (1 dia), RJ (mesmo dia)';
