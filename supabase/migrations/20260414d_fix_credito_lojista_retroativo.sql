-- Preencher credito_lojista_usado retroativamente
-- Abordagem 1: via lojistas_movimentacoes (quando venda_id existe)
UPDATE vendas v
SET credito_lojista_usado = m.valor
FROM lojistas_movimentacoes m
WHERE m.venda_id = v.id
  AND m.tipo = 'DEBITO'
  AND (v.credito_lojista_usado IS NULL OR v.credito_lojista_usado = 0);

-- Abordagem 2: via lojistas_movimentacoes por nome do cliente + data (quando venda_id não foi salvo)
UPDATE vendas v
SET credito_lojista_usado = m.valor
FROM lojistas_movimentacoes m
JOIN lojistas l ON l.id = m.lojista_id
WHERE m.tipo = 'DEBITO'
  AND m.venda_id IS NULL
  AND UPPER(l.nome) = UPPER(v.cliente)
  AND m.created_at::date = v.data
  AND (v.credito_lojista_usado IS NULL OR v.credito_lojista_usado = 0)
  AND v.tipo = 'ATACADO';
