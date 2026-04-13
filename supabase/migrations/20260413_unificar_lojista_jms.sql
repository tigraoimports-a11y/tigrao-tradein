-- Unificar "LOJA JMS" → "JMS"

UPDATE vendas SET cliente = 'JMS' WHERE cliente = 'LOJA JMS';
UPDATE vendas SET fornecedor = 'JMS' WHERE fornecedor = 'LOJA JMS';
UPDATE estoque SET cliente = 'JMS' WHERE cliente = 'LOJA JMS';
UPDATE estoque SET fornecedor = 'JMS' WHERE fornecedor = 'LOJA JMS';

-- Lojistas: transferir saldo e remover duplicado
UPDATE lojistas SET
  saldo_credito = saldo_credito + COALESCE(
    (SELECT SUM(saldo_credito) FROM lojistas WHERE nome = 'LOJA JMS'), 0
  )
WHERE nome = 'JMS';

UPDATE lojistas SET nome = 'JMS'
WHERE nome = 'LOJA JMS'
  AND NOT EXISTS (SELECT 1 FROM lojistas WHERE nome = 'JMS');

DELETE FROM lojistas WHERE nome = 'LOJA JMS';

UPDATE link_compras SET cliente_nome = 'JMS' WHERE cliente_nome = 'LOJA JMS';
UPDATE entregas SET cliente = 'JMS' WHERE cliente = 'LOJA JMS';
