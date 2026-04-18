-- Adiciona coluna `funcionario` na tabela gastos para vincular
-- pagamentos (ex: SALARIO) a um funcionario especifico.
-- Segue o mesmo padrao de `produtos_funcionarios.funcionario` (TEXT livre),
-- ja que nao existe tabela dedicada de funcionarios.

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS funcionario TEXT;

CREATE INDEX IF NOT EXISTS idx_gastos_funcionario ON gastos(funcionario);
