-- ============================================================
-- CORREÇÕES DE DADOS — 10/04/2026
-- ============================================================

-- 1. DELETAR duplicata iPhone 17 Air 1TB (IMEI errado)
DELETE FROM estoque WHERE imei = '356523760126756' OR serial_no = '356523760126756';

-- 2. Marcar ESGOTADO: JFXC1Q4Q3K (vendido para G THREE LTDA)
UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'JFXC1Q4Q3K' AND status != 'ESGOTADO';

-- 3. Marcar ESGOTADO: GC4F560VQM — AirPods Pro 3 (vendido 11/10/25 - Ramon Mendes Guimarães)
UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'GC4F560VQM' AND status != 'ESGOTADO';

-- 4. Criar vendas do sistema antigo + marcar ESGOTADO

-- 4a. HPVP9MTC7J → Raphael Nunes de Carvalho — R$ 9.029,81 (03/02/26)
INSERT INTO vendas (data, cliente, produto, preco_vendido, origem, tipo, serial_no, recebimento, banco, forma, created_at)
SELECT '2026-02-03', 'RAPHAEL NUNES DE CARVALHO', e.produto, 9029.81, 'NAO_INFORMARAM', 'VENDA', 'HPVP9MTC7J', 'D+0', 'ITAU', 'PIX', now()
FROM estoque e WHERE e.serial_no = 'HPVP9MTC7J' LIMIT 1;
UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'HPVP9MTC7J' AND status != 'ESGOTADO';

-- 4b. DM64TR2VTP → Rafael da Silva Lopes (CPF 015.987.293-65) — R$ 9.897,00 (20/11/25)
INSERT INTO vendas (data, cliente, cpf, produto, preco_vendido, origem, tipo, serial_no, recebimento, banco, forma, created_at)
SELECT '2025-11-20', 'RAFAEL DA SILVA LOPES', '015.987.293-65', e.produto, 9897.00, 'NAO_INFORMARAM', 'VENDA', 'DM64TR2VTP', 'D+0', 'ITAU', 'PIX', now()
FROM estoque e WHERE e.serial_no = 'DM64TR2VTP' LIMIT 1;
UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'DM64TR2VTP' AND status != 'ESGOTADO';

-- 4c. G7KM2MWMW9 → Integral Construtora (CNPJ 35.824.033/0001-30) — R$ 8.726,00 (27/11/25)
INSERT INTO vendas (data, cliente, cnpj, produto, preco_vendido, origem, tipo, serial_no, recebimento, banco, forma, created_at)
SELECT '2025-11-27', 'INTEGRAL CONSTRUTORA', '35.824.033/0001-30', e.produto, 8726.00, 'NAO_INFORMARAM', 'VENDA', 'G7KM2MWMW9', 'D+0', 'ITAU', 'PIX', now()
FROM estoque e WHERE e.serial_no = 'G7KM2MWMW9' LIMIT 1;
UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'G7KM2MWMW9' AND status != 'ESGOTADO';

-- 4d. M5DVPK2RQ2 → Raphael Lima Santos de Pinho — R$ 8.879,17 (12/02/26)
INSERT INTO vendas (data, cliente, produto, preco_vendido, origem, tipo, serial_no, recebimento, banco, forma, created_at)
SELECT '2026-02-12', 'RAPHAEL LIMA SANTOS DE PINHO', e.produto, 8879.17, 'NAO_INFORMARAM', 'VENDA', 'M5DVPK2RQ2', 'D+0', 'ITAU', 'PIX', now()
FROM estoque e WHERE e.serial_no = 'M5DVPK2RQ2' LIMIT 1;
UPDATE estoque SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'M5DVPK2RQ2' AND status != 'ESGOTADO';

-- 4e. GC4F560VQM → Ramon Mendes Guimarães (CPF 058.809.757-89) — R$ 2.497,00 (11/10/25)
INSERT INTO vendas (data, cliente, cpf, produto, preco_vendido, origem, tipo, serial_no, recebimento, banco, forma, created_at)
SELECT '2025-10-11', 'RAMON MENDES GUIMARAES', '058.809.757-89', e.produto, 2497.00, 'NAO_INFORMARAM', 'VENDA', 'GC4F560VQM', 'D+0', 'ITAU', 'PIX', now()
FROM estoque e WHERE e.serial_no = 'GC4F560VQM' LIMIT 1;

-- 5. Mac Mini: corrigir produto para 24GB/512GB
UPDATE estoque SET produto = REPLACE(produto, '16GB', '24GB'), updated_at = now()
WHERE serial_no IN ('H92HRV797J', 'H07G4V02QQ') AND produto ILIKE '%16GB%';

-- 6. Gastos — desvincular itens errados dos pedidos
-- Caso 1 (12:54, R$ 40.250): remover HPVP9MTC7J, DM64TR2VTP, G7KM2MWMW9
-- Caso 2 (11:48, R$ 24.150): remover M5DVPK2RQ2
-- Esses itens são vinculados via pedido_fornecedor_id no estoque.
-- Limpar o vínculo dos itens errados:
UPDATE estoque SET pedido_fornecedor_id = NULL, updated_at = now()
WHERE serial_no IN ('HPVP9MTC7J', 'DM64TR2VTP', 'G7KM2MWMW9', 'M5DVPK2RQ2');

-- Vincular os itens corretos ao gasto do Caso 1 (12:54)
-- Precisamos do ID do gasto. Usar subquery:
UPDATE estoque SET pedido_fornecedor_id = (
  SELECT id FROM gastos
  WHERE descricao ILIKE '%CRISTIANO%' AND data = '2026-03-30' AND hora = '12:54:00'
  LIMIT 1
), updated_at = now()
WHERE serial_no IN ('GY2V22WCJR', 'MGX1F4CP70', 'LGVM2Y0FHK', 'D7C4G764N2')
  AND pedido_fornecedor_id IS NULL;

-- Vincular os itens corretos ao gasto do Caso 2 (11:48)
UPDATE estoque SET pedido_fornecedor_id = (
  SELECT id FROM gastos
  WHERE descricao ILIKE '%CRISTIANO%' AND data = '2026-03-30' AND hora = '11:48:00'
  LIMIT 1
), updated_at = now()
WHERE serial_no IN ('F9CXCQP49N', 'JGW4RM9JMX')
  AND pedido_fornecedor_id IS NULL;
