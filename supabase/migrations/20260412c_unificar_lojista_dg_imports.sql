-- Unificar lojistas duplicados: "DG IMPORT" e "LOJA DG IMPORTS" → "DG IMPORTS"

-- 1. Atualizar vendas
UPDATE vendas SET cliente = 'DG IMPORTS' WHERE cliente IN ('DG IMPORT', 'LOJA DG IMPORTS');
UPDATE vendas SET fornecedor = 'DG IMPORTS' WHERE fornecedor IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 2. Atualizar estoque
UPDATE estoque SET cliente = 'DG IMPORTS' WHERE cliente IN ('DG IMPORT', 'LOJA DG IMPORTS');
UPDATE estoque SET fornecedor = 'DG IMPORTS' WHERE fornecedor IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 3. Lojistas: transferir saldo e renomear
-- Somar saldo dos duplicados no principal (se existir)
UPDATE lojistas SET
  saldo_credito = saldo_credito + COALESCE(
    (SELECT SUM(saldo_credito) FROM lojistas WHERE nome IN ('DG IMPORT', 'LOJA DG IMPORTS')), 0
  )
WHERE nome = 'DG IMPORTS';

-- Se DG IMPORTS nao existe mas DG IMPORT existe, renomear
UPDATE lojistas SET nome = 'DG IMPORTS'
WHERE nome = 'DG IMPORT'
  AND NOT EXISTS (SELECT 1 FROM lojistas WHERE nome = 'DG IMPORTS');

-- Remover duplicados restantes
DELETE FROM lojistas WHERE nome IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 4. Atualizar link_compras
UPDATE link_compras SET cliente_nome = 'DG IMPORTS' WHERE cliente_nome IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 5. Atualizar entregas
UPDATE entregas SET cliente = 'DG IMPORTS' WHERE cliente IN ('DG IMPORT', 'LOJA DG IMPORTS');
