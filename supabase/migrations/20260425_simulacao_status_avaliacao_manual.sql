-- Permite novo valor 'AVALIACAO_MANUAL' na coluna status de simulacoes.
-- O fluxo trade-in de iPad/MacBook/Apple Watch (StepManualHandoff) envia
-- esse status pra distinguir leads que precisam de avaliacao via WhatsApp,
-- mas a CHECK constraint atual rejeitava — INSERT falhava silenciosamente
-- (try/catch no cliente engolia o erro), entao a simulacao nao era salva
-- e o lead sumia. Reportado pelo Nicolas em 25/04/2026.

ALTER TABLE simulacoes DROP CONSTRAINT IF EXISTS simulacoes_status_check;

ALTER TABLE simulacoes
  ADD CONSTRAINT simulacoes_status_check
  CHECK (status IN ('GOSTEI', 'SAIR', 'AGUARDANDO_MP', 'INVALIDO', 'AVALIACAO_MANUAL'));
