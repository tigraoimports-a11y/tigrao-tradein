-- Permite novo valor 'INVALIDO' na coluna status de simulacoes.
-- A constraint antiga so aceitava GOSTEI/SAIR/AGUARDANDO_MP, impedindo marcar
-- lead como invalido pra troca.

-- Dropa a constraint antiga (se existir)
ALTER TABLE simulacoes DROP CONSTRAINT IF EXISTS simulacoes_status_check;

-- Recria com os valores permitidos, agora incluindo INVALIDO
ALTER TABLE simulacoes
  ADD CONSTRAINT simulacoes_status_check
  CHECK (status IN ('GOSTEI', 'SAIR', 'AGUARDANDO_MP', 'INVALIDO'));
