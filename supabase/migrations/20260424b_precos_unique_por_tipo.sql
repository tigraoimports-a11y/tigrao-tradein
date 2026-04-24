-- Separa precos LACRADO e SEMINOVO: antes o unique constraint era
-- (modelo, armazenamento) e quando cadastravam um SEMINOVO com mesmo
-- modelo+armazenamento do LACRADO ja existente, o upsert do POST
-- /admin/precos sobrescrevia a row LACRADO (trocando tipo pra SEMINOVO
-- e preco pro valor do seminovo). Consequencias em producao:
--   1. Aba "Valores Lacrados" perde o modelo (porque virou SEMINOVO).
--   2. Cron alerta-preco lia o preco SEMINOVO como se fosse o LACRADO,
--      calculava "queda" gigante e disparava WhatsApp errado pros
--      clientes que tinham simulado o LACRADO.
--
-- Fix: unique agora inclui tipo. Antes precisa backfillar NULL -> 'TRADEIN'
-- porque NULL nao participa de unique constraint em Postgres (cada NULL
-- e considerado distinto) e deixaria a constraint furada.

-- 1) Backfill: tipo NULL vira TRADEIN (alinhado com default do frontend)
UPDATE precos SET tipo = 'TRADEIN' WHERE tipo IS NULL;

-- 2) Remove unique antigo (modelo, armazenamento). O nome padrao do
--    Postgres quando criado via `UNIQUE (modelo, armazenamento)` inline
--    e precos_modelo_armazenamento_key, mas cobrimos qualquer nome via
--    pg_constraint pra nao quebrar se o schema foi renomeado.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'precos'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (modelo, armazenamento)';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE precos DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

-- 3) Novo unique incluindo tipo. SEMINOVO e LACRADO agora coexistem.
ALTER TABLE precos
  ADD CONSTRAINT precos_modelo_armazenamento_tipo_key
  UNIQUE (modelo, armazenamento, tipo);
