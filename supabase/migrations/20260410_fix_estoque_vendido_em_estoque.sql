-- =====================================================================
-- Migration: Correções de dados estoque/vendas/gastos — 2026-04-10
-- =====================================================================

-- 1. ESGOTADO genérico: itens em estoque com serial vendido
-- ─────────────────────────────────────────────────────────
UPDATE estoque e
SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
WHERE e.status = 'EM ESTOQUE'
  AND e.serial_no IS NOT NULL AND e.serial_no != ''
  AND EXISTS (
    SELECT 1 FROM vendas v
    WHERE UPPER(v.serial_no) = UPPER(e.serial_no)
      AND COALESCE(v.status_pagamento,'') != 'CANCELADO'
  );

-- 2. ESGOTADO específico: JFXC1Q4Q3K e GC4F560VQM (já vendidos)
-- ─────────────────────────────────────────────────────────────────
UPDATE estoque
SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
WHERE serial_no IN ('JFXC1Q4Q3K', 'GC4F560VQM')
  AND status != 'ESGOTADO';

-- 3. Recriar iPhone 17 Air 1TB apagado por engano (troca Mauro Mantuano)
-- ─────────────────────────────────────────────────────────────────────────
-- Só insere se não existir (proteção contra rodar 2x)
INSERT INTO estoque (
  produto, categoria, qnt, custo_unitario, status, tipo,
  serial_no, imei, fornecedor, cliente, updated_at
)
SELECT
  'IPHONE 17 AIR 1TB', 'IPHONES', 1, 0, 'EM ESTOQUE', 'SEMINOVO',
  'HLHW9X274W', '356523760126756', 'MAURO MANTUANO', 'MAURO MANTUANO', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM estoque WHERE serial_no = 'HLHW9X274W'
);

-- 4. Gastos 30/03 — desvincular itens errados, vincular corretos
-- ─────────────────────────────────────────────────────────────────
-- Gasto 1: pedido que já contém CQXMP7M2T2 (correto)
-- Errados: HPVP9MTC7J, DM64TR2VTP, G7KM2MWMW9
-- Corretos a vincular: GY2V22WCJR, MGX1F4CP70, LGVM2Y0FHK, D7C4G764N2

DO $$
DECLARE
  v_pedido1 UUID;
  v_pedido2 UUID;
BEGIN
  -- Encontrar pedido_fornecedor_id do gasto 1 via item correto já vinculado
  SELECT pedido_fornecedor_id INTO v_pedido1
  FROM estoque WHERE serial_no = 'CQXMP7M2T2' AND pedido_fornecedor_id IS NOT NULL
  LIMIT 1;

  IF v_pedido1 IS NOT NULL THEN
    -- Desvincular itens errados do gasto 1
    UPDATE estoque SET pedido_fornecedor_id = NULL, updated_at = NOW()
    WHERE serial_no IN ('HPVP9MTC7J', 'DM64TR2VTP', 'G7KM2MWMW9')
      AND pedido_fornecedor_id = v_pedido1;

    -- Vincular itens corretos ao gasto 1
    UPDATE estoque SET pedido_fornecedor_id = v_pedido1, updated_at = NOW()
    WHERE serial_no IN ('GY2V22WCJR', 'MGX1F4CP70', 'LGVM2Y0FHK', 'D7C4G764N2')
      AND (pedido_fornecedor_id IS NULL OR pedido_fornecedor_id != v_pedido1);
  END IF;

  -- Gasto 2: pedido que já contém CWF64GQTNQ (correto)
  -- Errado: M5DVPK2RQ2
  -- Corretos a vincular: F9CXCQP49N, JGW4RM9JMX
  SELECT pedido_fornecedor_id INTO v_pedido2
  FROM estoque WHERE serial_no = 'CWF64GQTNQ' AND pedido_fornecedor_id IS NOT NULL
  LIMIT 1;

  IF v_pedido2 IS NOT NULL THEN
    UPDATE estoque SET pedido_fornecedor_id = NULL, updated_at = NOW()
    WHERE serial_no = 'M5DVPK2RQ2'
      AND pedido_fornecedor_id = v_pedido2;

    UPDATE estoque SET pedido_fornecedor_id = v_pedido2, updated_at = NOW()
    WHERE serial_no IN ('F9CXCQP49N', 'JGW4RM9JMX')
      AND (pedido_fornecedor_id IS NULL OR pedido_fornecedor_id != v_pedido2);
  END IF;
END;
$$;

-- 5. Criar vendas do sistema antigo (itens que foram desvinculados dos gastos)
-- ──────────────────────────────────────────────────────────────────────────────
-- Marcar como ESGOTADO e criar vendas com dados do estoque

-- 5a. HPVP9MTC7J → RAPHAEL NUNES DE CARVALHO (03/02/2026)
INSERT INTO vendas (cliente, produto, data, serial_no, imei, custo, preco_vendido, status_pagamento, tipo, estoque_id)
SELECT 'RAPHAEL NUNES DE CARVALHO', e.produto, '2026-02-03', e.serial_no, e.imei,
       e.custo_unitario, e.custo_unitario, 'FINALIZADO', 'VAREJO', e.id
FROM estoque e WHERE e.serial_no = 'HPVP9MTC7J'
AND NOT EXISTS (SELECT 1 FROM vendas v WHERE UPPER(v.serial_no) = 'HPVP9MTC7J' AND COALESCE(v.status_pagamento,'') != 'CANCELADO')
LIMIT 1;

UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
WHERE serial_no = 'HPVP9MTC7J' AND status != 'ESGOTADO';

-- 5b. DM64TR2VTP → RAFAEL DA SILVA LOPES, CPF 015.987.293-65 (20/11/2025)
INSERT INTO vendas (cliente, cpf, produto, data, serial_no, imei, custo, preco_vendido, status_pagamento, tipo, estoque_id)
SELECT 'RAFAEL DA SILVA LOPES', '015.987.293-65', e.produto, '2025-11-20', e.serial_no, e.imei,
       e.custo_unitario, e.custo_unitario, 'FINALIZADO', 'VAREJO', e.id
FROM estoque e WHERE e.serial_no = 'DM64TR2VTP'
AND NOT EXISTS (SELECT 1 FROM vendas v WHERE UPPER(v.serial_no) = 'DM64TR2VTP' AND COALESCE(v.status_pagamento,'') != 'CANCELADO')
LIMIT 1;

UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
WHERE serial_no = 'DM64TR2VTP' AND status != 'ESGOTADO';

-- 5c. G7KM2MWMW9 → INTEGRAL CONSTRUTORA, CNPJ 35.824.033/0001-30 (27/11/2025)
INSERT INTO vendas (cliente, cnpj, produto, data, serial_no, imei, custo, preco_vendido, status_pagamento, tipo, estoque_id)
SELECT 'INTEGRAL CONSTRUTORA', '35.824.033/0001-30', e.produto, '2025-11-27', e.serial_no, e.imei,
       e.custo_unitario, e.custo_unitario, 'FINALIZADO', 'VAREJO', e.id
FROM estoque e WHERE e.serial_no = 'G7KM2MWMW9'
AND NOT EXISTS (SELECT 1 FROM vendas v WHERE UPPER(v.serial_no) = 'G7KM2MWMW9' AND COALESCE(v.status_pagamento,'') != 'CANCELADO')
LIMIT 1;

UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
WHERE serial_no = 'G7KM2MWMW9' AND status != 'ESGOTADO';

-- 5d. M5DVPK2RQ2 → RAPHAEL LIMA SANTOS DE PINHO (12/02/2026)
INSERT INTO vendas (cliente, produto, data, serial_no, imei, custo, preco_vendido, status_pagamento, tipo, estoque_id)
SELECT 'RAPHAEL LIMA SANTOS DE PINHO', e.produto, '2026-02-12', e.serial_no, e.imei,
       e.custo_unitario, e.custo_unitario, 'FINALIZADO', 'VAREJO', e.id
FROM estoque e WHERE e.serial_no = 'M5DVPK2RQ2'
AND NOT EXISTS (SELECT 1 FROM vendas v WHERE UPPER(v.serial_no) = 'M5DVPK2RQ2' AND COALESCE(v.status_pagamento,'') != 'CANCELADO')
LIMIT 1;

UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
WHERE serial_no = 'M5DVPK2RQ2' AND status != 'ESGOTADO';

-- 6. Mac Mini 24GB/512GB — separar de 16GB/512GB
-- ────────────────────────────────────────────────
-- H07G4V02QQ e H92HRV797J são 24GB/512GB, atualizar produto para distinguir
UPDATE estoque
SET produto = REPLACE(produto, '16GB/512GB', '24GB/512GB'),
    updated_at = NOW()
WHERE serial_no IN ('H07G4V02QQ', 'H92HRV797J')
  AND produto LIKE '%16GB/512GB%';

-- Se o produto não contém "16GB/512GB" explicitamente, forçar o nome correto
-- (adapte o nome do produto conforme o padrão usado no sistema)
UPDATE estoque
SET produto = REGEXP_REPLACE(produto, '16GB', '24GB'),
    updated_at = NOW()
WHERE serial_no IN ('H07G4V02QQ', 'H92HRV797J')
  AND produto LIKE '%16GB%'
  AND produto NOT LIKE '%24GB%';
