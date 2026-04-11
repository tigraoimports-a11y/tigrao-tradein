-- Adiciona coluna para registrar quanto crédito de lojista foi usado na venda
-- Permite rastrear e exibir na tela de operações
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS credito_lojista_usado NUMERIC DEFAULT 0;

-- Preencher retroativamente a partir das movimentações existentes
UPDATE vendas v
SET credito_lojista_usado = m.valor
FROM lojistas_movimentacoes m
WHERE m.venda_id = v.id
  AND m.tipo = 'DEBITO'
  AND v.credito_lojista_usado = 0;
