-- Adicionar ATACADO como tipo válido no estoque
-- (constraint pode não existir se já foi removida anteriormente)
DO $$
BEGIN
  ALTER TABLE estoque DROP CONSTRAINT IF EXISTS estoque_tipo_check;
  ALTER TABLE estoque ADD CONSTRAINT estoque_tipo_check
    CHECK (tipo IN ('NOVO','SEMINOVO','A_CAMINHO','PENDENCIA','NAO_ATIVADO','ATACADO'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
