-- Backfill dos trade-ins do ANDRÉ LUIZ VARELA DE SOUZA (07/03).
--
-- Andre fez 2 upgrades no mesmo dia com trade-ins:
--   1) iPhone 17 Pro Max 256GB Azul LL ← trocou iPhone 15 128GB PRETO BR
--      - Serial: R44DP69D96 / IMEI: 352182494024243 / Bateria: 89% / R$ 2.400
--      - Revendido pra 021 TECH (venda ja registrada, nao mexe)
--   2) Apple Watch Ultra 3 49mm ← trocou Apple Watch Series 9 45mm SILVER GPS
--      - Serial: JXNW062XXH / Bateria: 87% / R$ 800
--      - Revendido pra ANA RIO DAS OSTRAS (venda ja registrada, nao mexe)
--
-- A terceira venda (iPhone 17 Pro 256GB, TIPO=VENDA) nao foi mencionada como
-- upgrade com trade-in, entao nao eh tocada.

------------------------------------------------------------
-- 1. Trade-in do iPhone 15 na venda do iPhone 17 Pro Max (UPGRADE)
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 15 128GB PRETO SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'R44DP69D96'),
  troca_imei      = COALESCE(troca_imei,      '352182494024243'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE UPPER(cliente) = 'ANDRÉ LUIZ VARELA DE SOUZA'
  AND data = '2026-03-07'
  AND produto ILIKE '%IPHONE 17 PRO MAX%';

------------------------------------------------------------
-- 2. Trade-in do Apple Watch Series 9 na venda do Apple Watch Ultra 3 (UPGRADE)
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'APPLE WATCH SERIES 9 45MM SILVER GPS SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'JXNW062XXH'),
  troca_categoria = COALESCE(troca_categoria, 'APPLE WATCH')
WHERE UPPER(cliente) = 'ANDRÉ LUIZ VARELA DE SOUZA'
  AND data = '2026-03-07'
  AND produto ILIKE 'APPLE WATCH ULTRA 3%';

------------------------------------------------------------
-- 3. Liga o iPhone 15 (R44DP69D96) a Andre como origem no estoque
------------------------------------------------------------
UPDATE estoque
SET
  cliente    = 'ANDRÉ LUIZ VARELA DE SOUZA',
  fornecedor = 'ANDRÉ LUIZ VARELA DE SOUZA',
  updated_at = NOW()
WHERE serial_no = 'R44DP69D96'
  AND (cliente IS DISTINCT FROM 'ANDRÉ LUIZ VARELA DE SOUZA'
       OR fornecedor IS DISTINCT FROM 'ANDRÉ LUIZ VARELA DE SOUZA');

------------------------------------------------------------
-- 4. Liga o Apple Watch Series 9 (JXNW062XXH) a Andre como origem no estoque
------------------------------------------------------------
UPDATE estoque
SET
  cliente    = 'ANDRÉ LUIZ VARELA DE SOUZA',
  fornecedor = 'ANDRÉ LUIZ VARELA DE SOUZA',
  updated_at = NOW()
WHERE serial_no = 'JXNW062XXH'
  AND (cliente IS DISTINCT FROM 'ANDRÉ LUIZ VARELA DE SOUZA'
       OR fornecedor IS DISTINCT FROM 'ANDRÉ LUIZ VARELA DE SOUZA');
