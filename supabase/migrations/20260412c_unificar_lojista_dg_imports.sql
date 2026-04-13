-- Unificar lojistas duplicados: "DG IMPORT" e "LOJA DG IMPORTS" → "DG IMPORTS"

-- 1. Atualizar vendas que referenciam os nomes antigos
UPDATE vendas SET cliente = 'DG IMPORTS' WHERE cliente IN ('DG IMPORT', 'LOJA DG IMPORTS');
UPDATE vendas SET fornecedor = 'DG IMPORTS' WHERE fornecedor IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 2. Atualizar estoque
UPDATE estoque SET cliente = 'DG IMPORTS' WHERE cliente IN ('DG IMPORT', 'LOJA DG IMPORTS');
UPDATE estoque SET fornecedor = 'DG IMPORTS' WHERE fornecedor IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 3. Atualizar lojistas (transferir saldo para DG IMPORTS e remover duplicados)
-- Primeiro garantir que DG IMPORTS existe
INSERT INTO lojistas (nome) VALUES ('DG IMPORTS') ON CONFLICT (nome) DO NOTHING;

-- Transferir saldo_credito dos duplicados para o principal
UPDATE lojistas SET saldo_credito = saldo_credito + COALESCE(
  (SELECT SUM(saldo_credito) FROM lojistas WHERE nome IN ('DG IMPORT', 'LOJA DG IMPORTS')), 0
) WHERE nome = 'DG IMPORTS';

-- Remover duplicados
DELETE FROM lojistas WHERE nome IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 4. Atualizar link_compras
UPDATE link_compras SET cliente_nome = 'DG IMPORTS' WHERE cliente_nome IN ('DG IMPORT', 'LOJA DG IMPORTS');

-- 5. Atualizar entregas
UPDATE entregas SET cliente = 'DG IMPORTS' WHERE cliente IN ('DG IMPORT', 'LOJA DG IMPORTS');
