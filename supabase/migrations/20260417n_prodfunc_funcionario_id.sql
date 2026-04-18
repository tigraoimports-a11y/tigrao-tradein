-- Adiciona FK `funcionario_id` em produtos_funcionarios.
-- Ate agora o vinculo era por TEXT livre (coluna `funcionario`), o que
-- permitia variantes do mesmo nome (PALOMA vs Paloma vs paloma) e nao
-- permitia juntar com a tabela master de funcionarios.

ALTER TABLE produtos_funcionarios
  ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES funcionarios(id);

CREATE INDEX IF NOT EXISTS idx_prodfunc_funcionario_id
  ON produtos_funcionarios(funcionario_id);

-- Backfill: casa PALOMA / Paloma / paloma com o funcionario cadastrado de
-- mesmo nome (case-insensitive, trim).
UPDATE produtos_funcionarios pf
SET funcionario_id = f.id
FROM funcionarios f
WHERE pf.funcionario_id IS NULL
  AND UPPER(TRIM(pf.funcionario)) = UPPER(TRIM(f.nome));
