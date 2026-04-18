-- Complemento do backfill v2 + correcao de venda com serial errado.
--
-- 1) Venda pra 2L IMPORTS de 20/03 (id 48a2c885-...) ficou com serial/imei/produto
--    errados — duplicou os dados do iPhone 17 Pro que foi vendido pra JF IMPORTS
--    em 21/03 (mesmo serial CNWVKD64JF). O produto REAL vendido em 20/03 era o
--    H4T5253763 (iPhone 15 Pro Natural Titanium), que veio do trade-in da Vanessa.
--
-- 2) Completa o backfill v2: preenche troca_produto2/troca_imei2 da Carolina
--    (L7LQC9NTJR) e troca_produto/troca_imei da Vanessa (H4T5253763), cujos
--    modelos nao existiam na v2.

------------------------------------------------------------
-- 1. Corrige a venda pra 2L IMPORTS (20/03) — serial estava trocado
-- AND serial_no = 'CNWVKD64JF' eh guard contra reexecucao (idempotente).
------------------------------------------------------------
UPDATE vendas
SET
  produto    = 'IPHONE 15 PRO 128GB NATURAL TITANIUM SEMINOVO',
  serial_no  = 'H4T5253763',
  imei       = '353884191494301',
  fornecedor = 'UPGRADE'
WHERE id = '48a2c885-0db9-4d44-80bb-660655084b1d'
  AND serial_no = 'CNWVKD64JF';

------------------------------------------------------------
-- 2a. Carolina Penades — 2º trade-in (L7LQC9NTJR) — modelo agora conhecido
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto2   = COALESCE(troca_produto2,   'IPHONE 14 PRO MAX 256GB DEEP PURPLE SEMINOVO'),
  troca_serial2    = COALESCE(troca_serial2,    'L7LQC9NTJR'),
  troca_imei2      = COALESCE(troca_imei2,      '359451591687845'),
  troca_categoria2 = COALESCE(troca_categoria2, 'IPHONES'),
  troca_cor2       = COALESCE(troca_cor2,       'DEEP PURPLE'),
  troca_bateria2   = COALESCE(troca_bateria2,   '84')
WHERE id = 'c4318c32-aebe-437d-aa3c-c9ee0ee066b4';

------------------------------------------------------------
-- 2b. Vanessa Rodrigues Santos — trade-in (H4T5253763) — modelo agora conhecido
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 15 PRO 128GB NATURAL TITANIUM SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'H4T5253763'),
  troca_imei      = COALESCE(troca_imei,      '353884191494301'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES'),
  troca_cor       = COALESCE(troca_cor,       'NATURAL TITANIUM'),
  troca_bateria   = COALESCE(troca_bateria,   '87')
WHERE id = '78b83742-9c83-4437-b595-4236ad67ee06';
