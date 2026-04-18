-- Backfill: produtos que foram vinculados a funcionarios ANTES do fix ficaram
-- orfaos no estoque (qnt=1, status variado). Esse script corrige:
-- pra cada vinculo ativo (nao DEVOLVIDO) com estoque_id, forca o item do estoque
-- pra qnt=0 + status=COM_FUNCIONARIO.

UPDATE estoque e
SET status = 'COM_FUNCIONARIO',
    qnt = 0,
    updated_at = NOW()
FROM produtos_funcionarios pf
WHERE pf.estoque_id = e.id
  AND pf.status NOT IN ('DEVOLVIDO');
