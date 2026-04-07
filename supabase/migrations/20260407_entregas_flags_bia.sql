-- Flags de controle da Bia na aba de entregas
ALTER TABLE entregas
  ADD COLUMN IF NOT EXISTS finalizada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS comprovante_lancado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_entregas_finalizada ON entregas(finalizada) WHERE finalizada = TRUE;
CREATE INDEX IF NOT EXISTS idx_entregas_comprovante_lancado ON entregas(comprovante_lancado) WHERE comprovante_lancado = TRUE;
