-- =====================================================================
-- Migration: Correções gastos/vendas — parte 2 (dados faltantes)
-- =====================================================================
-- Os itens corretos dos gastos não existiam no estoque.
-- Esta migration os cria e vincula ao pedido_fornecedor_id correto.

-- 1. Gasto 1 (12:54, R$40.250) — pedido via CQXMP7M2T2
-- Criar 4 itens faltantes e vincular ao mesmo pedido_fornecedor_id
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_pedido1 UUID;
  v_pedido2 UUID;
BEGIN
  -- Pedido 1: via CQXMP7M2T2
  SELECT pedido_fornecedor_id INTO v_pedido1
  FROM estoque WHERE serial_no = 'CQXMP7M2T2' AND pedido_fornecedor_id IS NOT NULL
  LIMIT 1;

  IF v_pedido1 IS NOT NULL THEN
    -- GY2V22WCJR
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'GY2V22WCJR', '350025975605398', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'GY2V22WCJR');

    -- MGX1F4CP70
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'MGX1F4CP70', '350025974930078', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'MGX1F4CP70');

    -- LGVM2Y0FHK
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'LGVM2Y0FHK', '351771405503567', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'LGVM2Y0FHK');

    -- D7C4G764N2
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'D7C4G764N2', '350025975617740', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'D7C4G764N2');
  END IF;

  -- Pedido 2: via CWF64GQTNQ
  SELECT pedido_fornecedor_id INTO v_pedido2
  FROM estoque WHERE serial_no = 'CWF64GQTNQ' AND pedido_fornecedor_id IS NOT NULL
  LIMIT 1;

  IF v_pedido2 IS NOT NULL THEN
    -- F9CXCQP49N
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'F9CXCQP49N', '350025975562409', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido2, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'F9CXCQP49N');
  END IF;
END;
$$;

-- 2. Atualizar vendas do sistema antigo com preços corretos
-- ─────────────────────────────────────────────────────────

-- HPVP9MTC7J → compra R$8.200, venda R$9.029,81
UPDATE vendas SET custo = 8200, preco_vendido = 9029.81
WHERE serial_no = 'HPVP9MTC7J' AND cliente = 'RAPHAEL NUNES DE CARVALHO';

-- DM64TR2VTP → compra R$8.903, venda R$9.897
UPDATE vendas SET custo = 8903, preco_vendido = 9897
WHERE serial_no = 'DM64TR2VTP' AND cliente = 'RAFAEL DA SILVA LOPES';

-- G7KM2MWMW9 → compra R$7.850, venda R$8.726
UPDATE vendas SET custo = 7850, preco_vendido = 8726
WHERE serial_no = 'G7KM2MWMW9' AND cliente = 'INTEGRAL CONSTRUTORA';

-- M5DVPK2RQ2 → compra R$7.600, venda R$8.879,17
UPDATE vendas SET custo = 7600, preco_vendido = 8879.17
WHERE serial_no = 'M5DVPK2RQ2' AND cliente = 'RAPHAEL LIMA SANTOS DE PINHO';

-- Atualizar custo no estoque também
UPDATE estoque SET custo_unitario = 8200 WHERE serial_no = 'HPVP9MTC7J';
UPDATE estoque SET custo_unitario = 8903 WHERE serial_no = 'DM64TR2VTP';
UPDATE estoque SET custo_unitario = 7850 WHERE serial_no = 'G7KM2MWMW9';
UPDATE estoque SET custo_unitario = 7600 WHERE serial_no = 'M5DVPK2RQ2';

-- 3. Corrigir HLHW9X274W — tipo SEMINOVO, data de compra, fornecedor
-- ────────────────────────────────────────────────────────────────────
UPDATE estoque
SET tipo = 'SEMINOVO',
    fornecedor = 'MAURO MANTUANO',
    cliente = 'MAURO MANTUANO',
    updated_at = NOW()
WHERE serial_no = 'HLHW9X274W';
