-- Corrige banco do gasto R$47.500 BERNARDO de 01/04
--
-- Motivo: ao conferir com extratos bancários, descobriu-se que este PIX saiu
-- do Infinite (para LIQD FINANCE, intermediador do Bernardo), não do Itaú.
--
-- Sistema tinha: banco = ITAU
-- Correto: banco = INFINITE
--
-- ID do gasto: ab88141f-11cc-4aba-8e15-e3c9e3d17f49
-- Data: 2026-04-01 | Valor: R$47.500 | Categoria: FORNECEDOR | Fornecedor: BERNARDO

UPDATE gastos
SET
  banco = 'INFINITE',
  observacao = COALESCE(observacao || ' | ', '') || 'Corrigido 17/04: banco era ITAU, mas PIX saiu do Infinite para LIQD FINANCE (conferido com extrato)'
WHERE id = 'ab88141f-11cc-4aba-8e15-e3c9e3d17f49';
