-- Backfill do trade-in da PRISCIELLEN PASSARINHO DA SILVA MENCARI (17/03).
--
-- Prisciellen deu um iPhone 14 Plus 128GB BRANCO no upgrade pro iPhone 16 Rosa:
--   - Serial:  GF7KYFH6DV
--   - IMEI:    355843709042901
--   - Bateria: 85%
--   - Avaliado: R$ 2.300
-- Esse trade-in foi revendido pra Ana Rio das Ostras em 28/03 (venda ja existe
-- e esta correta — so falta o vinculo do produto com a cliente de origem).

------------------------------------------------------------
-- 1. Backfill dos campos troca_* na venda da Prisciellen (17/03)
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 14 PLUS 256GB BRANCO SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'GF7KYFH6DV'),
  troca_imei      = COALESCE(troca_imei,      '355843709042901'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE UPPER(cliente) = 'PRISCIELLEN PASSARINHO DA SILVA MENCARI'
  AND data = '2026-03-17';

------------------------------------------------------------
-- 2. Liga o iPhone 14 Plus (GF7KYFH6DV) a Prisciellen no estoque
-- (cliente/fornecedor de origem — mesmo padrao da pendencia auto)
------------------------------------------------------------
UPDATE estoque
SET
  cliente    = 'PRISCIELLEN PASSARINHO DA SILVA MENCARI',
  fornecedor = 'PRISCIELLEN PASSARINHO DA SILVA MENCARI',
  updated_at = NOW()
WHERE serial_no = 'GF7KYFH6DV'
  AND (cliente IS DISTINCT FROM 'PRISCIELLEN PASSARINHO DA SILVA MENCARI'
       OR fornecedor IS DISTINCT FROM 'PRISCIELLEN PASSARINHO DA SILVA MENCARI');
