-- =====================================================================
-- Migration ÚNICA: todas as correções pendentes (gastos + vendas + HLHW + fantasmas)
-- Substitui 20260410e e 20260410f
-- =====================================================================

-- 1. Criar itens faltantes nos gastos e vincular ao pedido correto
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pedido1 UUID;
  v_pedido2 UUID;
BEGIN
  SELECT pedido_fornecedor_id INTO v_pedido1
  FROM estoque WHERE serial_no = 'CQXMP7M2T2' AND pedido_fornecedor_id IS NOT NULL LIMIT 1;

  IF v_pedido1 IS NOT NULL THEN
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'GY2V22WCJR', '350025975605398', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'GY2V22WCJR');

    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'MGX1F4CP70', '350025974930078', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'MGX1F4CP70');

    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'LGVM2Y0FHK', '351771405503567', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'LGVM2Y0FHK');

    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'D7C4G764N2', '350025975617740', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'D7C4G764N2');
  END IF;

  SELECT pedido_fornecedor_id INTO v_pedido2
  FROM estoque WHERE serial_no = 'CWF64GQTNQ' AND pedido_fornecedor_id IS NOT NULL LIMIT 1;

  IF v_pedido2 IS NOT NULL THEN
    INSERT INTO estoque (produto, categoria, qnt, custo_unitario, status, tipo, serial_no, imei, fornecedor, cor, data_compra, pedido_fornecedor_id, updated_at)
    SELECT 'IPHONE 17 PRO MAX 256GB PRATA VC (CAN)- E-SIM', 'IPHONES', 0, 8050, 'ESGOTADO', 'NOVO', 'F9CXCQP49N', '350025975562409', 'CRISTIANO', 'SILVER', '2026-03-30', v_pedido2, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM estoque WHERE serial_no = 'F9CXCQP49N');
  END IF;
END;
$$;

-- 2. Vendas sistema antigo — preços corretos
-- ───────────────────────────────────────────
UPDATE vendas SET custo = 8200, preco_vendido = 9029.81 WHERE serial_no = 'HPVP9MTC7J' AND cliente = 'RAPHAEL NUNES DE CARVALHO';
UPDATE vendas SET custo = 8903, preco_vendido = 9897 WHERE serial_no = 'DM64TR2VTP' AND cliente = 'RAFAEL DA SILVA LOPES';
UPDATE vendas SET custo = 7850, preco_vendido = 8726 WHERE serial_no = 'G7KM2MWMW9' AND cliente = 'INTEGRAL CONSTRUTORA';
UPDATE vendas SET custo = 7600, preco_vendido = 8879.17 WHERE serial_no = 'M5DVPK2RQ2' AND cliente = 'RAPHAEL LIMA SANTOS DE PINHO';

UPDATE estoque SET custo_unitario = 8200 WHERE serial_no = 'HPVP9MTC7J';
UPDATE estoque SET custo_unitario = 8903 WHERE serial_no = 'DM64TR2VTP';
UPDATE estoque SET custo_unitario = 7850 WHERE serial_no = 'G7KM2MWMW9';
UPDATE estoque SET custo_unitario = 7600 WHERE serial_no = 'M5DVPK2RQ2';

-- 3. Remover itens fantasma (sem serial) dos gastos
-- ──────────────────────────────────────────────────
DELETE FROM estoque WHERE id = 'abeee3ba-0f2b-430a-9290-9c7f219e6f93';
DELETE FROM estoque WHERE id = '522cbb79-3d58-4ac9-8b2a-41674b350efb';

-- 4. HLHW9X274W — Lacrado, R$7.500, entrada 08/04/2026
-- ─────────────────────────────────────────────────────
UPDATE estoque
SET tipo = 'NOVO',
    custo_unitario = 7500,
    data_compra = '2026-04-08',
    data_entrada = '2026-04-08',
    fornecedor = 'MAURO MANTUANO',
    cliente = 'MAURO MANTUANO',
    updated_at = NOW()
WHERE serial_no = 'HLHW9X274W';
