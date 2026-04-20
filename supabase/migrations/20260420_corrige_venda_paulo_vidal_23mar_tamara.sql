-- Corrige venda pra PAULO VIDAL de 23/03 — 3º item estava com serial/imei/produto
-- errados, duplicando os dados do 1º item (J5W293YN92 / IPHONE 13 PRETO).
--
-- O item fisico REAL do 3º registro eh o iPhone 13 128GB BRANCO que veio do
-- trade-in da Tamara Romano Bezerra (venda de 20/03, upgrade pro iPhone 17):
--   - Serial: PTPH95XXQH
--   - IMEI:   352364225571656
--   - Bateria: 79%
--   - Custo: R$ 1.300 (valor avaliado do trade-in)
--
-- Tambem completa o backfill da troca na venda da Tamara (preenche troca_*
-- se ainda estiver NULL — idempotente via COALESCE).

------------------------------------------------------------
-- 1. Corrige o 3º item da venda do PAULO VIDAL (23/03)
-- Identificacao: mesmo cliente/data + serial duplicado J5W293YN92 + custo 1300
-- (o item legitimo com esse serial tem custo 1200 — guard contra reexecucao).
------------------------------------------------------------
UPDATE vendas
SET
  produto    = 'IPHONE 13 128GB BRANCO SEMINOVO',
  serial_no  = 'PTPH95XXQH',
  imei       = '352364225571656',
  fornecedor = 'UPGRADE'
WHERE UPPER(cliente) = 'PAULO VIDAL'
  AND data = '2026-03-23'
  AND serial_no = 'J5W293YN92'
  AND custo = 1300;

------------------------------------------------------------
-- 2. Backfill do trade-in na venda da TAMARA ROMANO BEZERRA (20/03)
-- Tamara deu o iPhone 13 Branco (PTPH95XXQH) no upgrade pro iPhone 17.
-- COALESCE garante que so preenche campos ainda NULL.
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 13 128GB BRANCO SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'PTPH95XXQH'),
  troca_imei      = COALESCE(troca_imei,      '352364225571656'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE UPPER(cliente) = 'TAMARA ROMANO BEZERRA'
  AND data = '2026-03-20';
