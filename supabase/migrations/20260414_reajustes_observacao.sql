-- Adiciona campo de observação aos reajustes (usado quando motivo = "Outro")
ALTER TABLE reajustes ADD COLUMN IF NOT EXISTS observacao TEXT;
