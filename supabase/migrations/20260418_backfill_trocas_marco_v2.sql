-- Backfill v2: vincula produtos de trade-in as vendas de upgrade de marco/2026.
--
-- Versao anterior (20260417o_) nao afetou nada porque tentou buscar os
-- produtos no `estoque` — mas esses trade-ins ja foram revendidos como ATACADO,
-- entao os serials aparecem na tabela `vendas` (nao `estoque`).
--
-- Esta versao usa os IDs das vendas diretamente (ja confirmados via diagnostico),
-- e busca o produto/imei do trade-in na tabela `vendas` (onde o mesmo serial foi
-- registrado como produto vendido pra atacado depois do upgrade).
--
-- Escopo: SO preenche troca_produto/troca_serial/troca_imei/troca_categoria em
-- 6 vendas especificas. Nao mexe em valor, cliente, pagamento, status.
-- Idempotente (COALESCE, so preenche se estiver NULL).

------------------------------------------------------------
-- 02/03 — Alexandra Ferrari (venda id aee80b50-...) — trade-in D396PWWHNJ
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 14 PRO MAX 128GB SPACE BLACK ZP (HK/MO)- E-SIM'),
  troca_serial    = COALESCE(troca_serial,    'D396PWWHNJ'),
  troca_imei      = COALESCE(troca_imei,      '352632921341685'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE id = 'aee80b50-f6af-4a33-beef-bfa924a46cbe';

------------------------------------------------------------
-- 02/03 — Roberto Soares (venda id 512ea8ae-...) — trade-in FWDX7347KL
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 16 PRO MAX 256GB BLACK TITANIUM LL (EUA)- E-SIM'),
  troca_serial    = COALESCE(troca_serial,    'FWDX7347KL'),
  troca_imei      = COALESCE(troca_imei,      '354331128040806'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE id = '512ea8ae-5396-432b-b635-19ebdd701073';

------------------------------------------------------------
-- 03/03 — Andréa Cota Freitas Bastos (venda iPhone 17 Pro) — trade-in F17F2PCW0D91
-- Obs: Andrea tem 2 vendas nesse dia (iPhone + Apple Watch). O trade-in vai na
-- venda do iPhone (upgrade natural). Se for pra vincular ao Apple Watch, mudar id.
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 12 PRO 128GB AZUL SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'F17F2PCW0D91'),
  troca_imei      = COALESCE(troca_imei,      '35279829208483'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE id = '48841074-eefe-417b-9b56-1b6af03652be';

------------------------------------------------------------
-- 03/03 — Carolina Penades Lima (venda id c4318c32-...) — 2 trade-ins
-- 1º: KN4924074V (IPHONE 14 PRO MAX 256GB ROXO SEMINOVO)
-- 2º: L7LQC9NTJR (modelo desconhecido — so preenche serial)
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 14 PRO MAX 256GB ROXO SEMINOVO'),
  troca_serial    = COALESCE(troca_serial,    'KN4924074V'),
  troca_imei      = COALESCE(troca_imei,      '359451591954021'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES'),
  troca_serial2   = COALESCE(troca_serial2,   'L7LQC9NTJR')  -- modelo a preencher manualmente
WHERE id = 'c4318c32-aebe-437d-aa3c-c9ee0ee066b4';

------------------------------------------------------------
-- 03/03 — Inconnect Marketing LTDA (venda id 7bd80e28-...) — trade-in DVPX4104JT
-- Obs: CNPJ esta no campo `cpf` pra PJ nessa venda (nao no `cnpj`).
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 17 PRO MAX 256GB LARANJA CHIP FÍSICO'),
  troca_serial    = COALESCE(troca_serial,    'DVPX4104JT'),
  troca_imei      = COALESCE(troca_imei,      '355292135329518'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE id = '7bd80e28-42a9-4063-a85f-4c4a3234ff2a';

------------------------------------------------------------
-- 03/03 — Jéssica Jorge de Freitas (venda id bde664d6-...) — trade-in M52N70FHPG
------------------------------------------------------------
UPDATE vendas
SET
  troca_produto   = COALESCE(troca_produto,   'IPHONE 16 PRO 256GB DESERT TITANIUM LL (EUA)- E-SIM'),
  troca_serial    = COALESCE(troca_serial,    'M52N70FHPG'),
  troca_imei      = COALESCE(troca_imei,      '357234292324112'),
  troca_categoria = COALESCE(troca_categoria, 'IPHONES')
WHERE id = 'bde664d6-7164-4312-bf6a-076a41a72ce8';

------------------------------------------------------------
-- 03/03 — Vanessa Rodrigues Santos (venda id 78b83742-...) — trade-in H4T5253763
-- Obs: Serial H4T5253763 nao existe no sistema — so registra o serial, sem produto.
------------------------------------------------------------
UPDATE vendas
SET
  troca_serial    = COALESCE(troca_serial,    'H4T5253763')  -- modelo a preencher manualmente
WHERE id = '78b83742-9c83-4437-b595-4236ad67ee06';
