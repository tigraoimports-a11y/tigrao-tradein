-- Remove a coluna `gastos.funcionario` (TEXT) criada por engano em
-- 20260417l_gastos_funcionario.sql. A coluna canonica eh `gastos.funcionario_id`
-- (UUID FK pra tabela funcionarios), criada em 20260417l_funcionarios.sql.

ALTER TABLE gastos DROP COLUMN IF EXISTS funcionario;
