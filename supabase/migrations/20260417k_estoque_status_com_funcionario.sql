-- O CHECK constraint existente em estoque.status nao aceita 'COM_FUNCIONARIO'.
-- Recria aceitando todos os status conhecidos + COM_FUNCIONARIO.

ALTER TABLE estoque DROP CONSTRAINT IF EXISTS estoque_status_check;
ALTER TABLE estoque ADD CONSTRAINT estoque_status_check
  CHECK (status IN (
    'EM ESTOQUE',
    'ESGOTADO',
    'A CAMINHO',
    'PENDENTE',
    'RESERVADO',
    'DEVOLVIDO',
    'COM_FUNCIONARIO'
  ));

-- Agora roda o backfill (igual ao 20260417j que falhou)
UPDATE estoque e
SET status = 'COM_FUNCIONARIO',
    qnt = 0,
    updated_at = NOW()
FROM produtos_funcionarios pf
WHERE pf.estoque_id = e.id
  AND pf.status NOT IN ('DEVOLVIDO');
