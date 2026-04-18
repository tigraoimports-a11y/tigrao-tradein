-- Backfill manual: vincula produtos de trade-in de VENDAS de UPGRADE de marco/2026
-- que vieram migrados do sistema antigo com a relacao produto ↔ venda quebrada.
--
-- Estrategia conservadora (nao mexe em logica):
--   - Apenas UPDATE em `vendas` preenchendo troca_produto / troca_serial /
--     troca_imei / troca_categoria / troca_cor com os dados do item ja existente
--     na tabela `estoque` (match por serial).
--   - Match da venda: por (data + CPF) ou (data + CNPJ) ou (data + nome).
--   - CPF/CNPJ comparados SEM pontuacao (REPLACE de . / - / /) pra robustez.
--   - Serial comparado em UPPER pra ser case-insensitive.
--   - Idempotente: so atualiza se troca_serial (ou troca_serial2) ainda IS NULL.
--
-- Nao cria registros em `trocas` nem mexe em `estoque.troca_id` — so o suficiente
-- pra o preview do produto aparecer dentro da venda. Se for preciso vincular
-- formalmente via tabela `trocas` depois, fazemos em migration separada.

-- Helper: normaliza documento (CPF/CNPJ) removendo pontuacao
-- (inline via REPLACE encadeado pra nao criar funcao permanente)

------------------------------------------------------------
-- 02/03 — Alexandra Ferrari — CPF 092.769.877-38 — Serial D396PWWHNJ
------------------------------------------------------------
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-02'
  AND REPLACE(REPLACE(REPLACE(COALESCE(v.cpf, ''), '.', ''), '-', ''), ' ', '') = '09276987738'
  AND UPPER(e.serial_no) = 'D396PWWHNJ'
  AND v.troca_serial IS NULL;

------------------------------------------------------------
-- 02/03 — Roberto Soares — CPF 086.185.147-13 — Serial FWDX7347KL
------------------------------------------------------------
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-02'
  AND REPLACE(REPLACE(REPLACE(COALESCE(v.cpf, ''), '.', ''), '-', ''), ' ', '') = '08618514713'
  AND UPPER(e.serial_no) = 'FWDX7347KL'
  AND v.troca_serial IS NULL;

------------------------------------------------------------
-- 03/03 — Andréa Cota Freitas Bastos — Serial F17F2PCW0D91 (sem CPF informado)
-- Match por nome: cliente ILIKE '%andrea%cota%' (case/acento relaxado)
------------------------------------------------------------
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-03'
  AND (
    v.cliente ILIKE '%andrea%cota%freitas%' OR
    v.cliente ILIKE '%andréa%cota%freitas%'
  )
  AND UPPER(e.serial_no) = 'F17F2PCW0D91'
  AND v.troca_serial IS NULL;

------------------------------------------------------------
-- 03/03 — Carolina Penades Lima — CPF 123.532.067-78
-- DOIS produtos: KN4924074V (principal) + L7LQC9NTJR (segundo)
------------------------------------------------------------
-- Primeiro produto → troca_serial / troca_produto / troca_imei
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-03'
  AND REPLACE(REPLACE(REPLACE(COALESCE(v.cpf, ''), '.', ''), '-', ''), ' ', '') = '12353206778'
  AND UPPER(e.serial_no) = 'KN4924074V'
  AND v.troca_serial IS NULL;

-- Segundo produto → troca_serial2 / troca_produto2 / troca_imei2
UPDATE vendas v
SET
  troca_produto2   = COALESCE(v.troca_produto2,   e.produto),
  troca_serial2    = COALESCE(v.troca_serial2,    e.serial_no),
  troca_imei2      = COALESCE(v.troca_imei2,      e.imei),
  troca_categoria2 = COALESCE(v.troca_categoria2, e.categoria),
  troca_cor2       = COALESCE(v.troca_cor2,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-03'
  AND REPLACE(REPLACE(REPLACE(COALESCE(v.cpf, ''), '.', ''), '-', ''), ' ', '') = '12353206778'
  AND UPPER(e.serial_no) = 'L7LQC9NTJR'
  AND v.troca_serial2 IS NULL;

------------------------------------------------------------
-- 03/03 — Inconnect Marketing LTDA — CNPJ 24.265.713/0001-45 — Serial DVPX4104JT
------------------------------------------------------------
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-03'
  AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(v.cnpj, ''), '.', ''), '-', ''), '/', ''), ' ', '') = '24265713000145'
  AND UPPER(e.serial_no) = 'DVPX4104JT'
  AND v.troca_serial IS NULL;

------------------------------------------------------------
-- 03/03 — Jéssica Jorge de Freitas — CPF 143.881.067-98 — Serial M52N70FHPG
------------------------------------------------------------
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-03'
  AND REPLACE(REPLACE(REPLACE(COALESCE(v.cpf, ''), '.', ''), '-', ''), ' ', '') = '14388106798'
  AND UPPER(e.serial_no) = 'M52N70FHPG'
  AND v.troca_serial IS NULL;

------------------------------------------------------------
-- 03/03 — Vanessa Rodrigues Santos — CPF 009.193.392-71 — Serial H4T5253763
------------------------------------------------------------
UPDATE vendas v
SET
  troca_produto   = COALESCE(v.troca_produto,   e.produto),
  troca_serial    = COALESCE(v.troca_serial,    e.serial_no),
  troca_imei      = COALESCE(v.troca_imei,      e.imei),
  troca_categoria = COALESCE(v.troca_categoria, e.categoria),
  troca_cor       = COALESCE(v.troca_cor,       e.cor)
FROM estoque e
WHERE v.data = '2026-03-03'
  AND REPLACE(REPLACE(REPLACE(COALESCE(v.cpf, ''), '.', ''), '-', ''), ' ', '') = '00919339271'
  AND UPPER(e.serial_no) = 'H4T5253763'
  AND v.troca_serial IS NULL;
