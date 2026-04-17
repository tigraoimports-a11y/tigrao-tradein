-- Corrige banco do gasto R$35.150 CAPTAIN de 10/04
--
-- Motivo: ao conferir com extratos bancários, descobriu-se que este PIX saiu
-- do Infinite (para HRI CONECT LTDA, intermediador do CAPTAIN), não do Itaú.
--
-- Sistema tinha: banco = ITAU
-- Correto: banco = INFINITE
--
-- ID do gasto: 007b62d8-103b-4ce8-bb1a-dfe8464b7dd5
-- Data: 2026-04-10 | Valor: R$35.150 | Categoria: FORNECEDOR | Fornecedor: CAPTAIN

UPDATE gastos
SET
  banco = 'INFINITE',
  observacao = COALESCE(observacao || ' | ', '') || 'Corrigido 17/04: banco era ITAU, mas PIX saiu do Infinite para HRI CONECT (conferido com extrato)'
WHERE id = '007b62d8-103b-4ce8-bb1a-dfe8464b7dd5';
