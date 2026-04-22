-- Recupera as alterações da migration 20260422b que falharam em produção.
--
-- A 20260422b abortou em
--   "check constraint vendas_origem_check of relation vendas is violated by some row"
-- porque a tabela tinha vendas com origem fora do novo enum
-- (ANUNCIO/RECOMPRA/INDICACAO/ATACADO/FORMULARIO). Provavelmente
-- NAO_INFORMARAM vindo de imports de CSV antigos.
--
-- Como ALTER TABLE ADD CONSTRAINT faz rollback da transação inteira quando
-- falha, NADA da 20260422b foi aplicado: nem short_code, nem origem_detalhe,
-- nem o status FORMULARIO_PREENCHIDO. Por isso o /compra → from-formulario
-- estava quebrado em produção (erros PGRST204 "coluna cor/origem_detalhe não
-- existe").
--
-- Essa migration:
--   1. Normaliza origens inválidas pra NAO_INFORMARAM (preserva histórico)
--   2. Aplica a nova constraint INCLUINDO NAO_INFORMARAM (não quebra vendas antigas)
--   3. Reaplica todas as outras mudanças da 20260422b (IF NOT EXISTS é safe)

-- 1. Backfill: qualquer origem fora da lista vai pra NAO_INFORMARAM
UPDATE vendas SET origem = 'NAO_INFORMARAM'
WHERE origem IS NULL
   OR origem NOT IN ('ANUNCIO','RECOMPRA','INDICACAO','ATACADO','FORMULARIO','NAO_INFORMARAM');

-- 2. Status FORMULARIO_PREENCHIDO (igual 20260422b)
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_status_pagamento_check;

ALTER TABLE vendas ADD CONSTRAINT vendas_status_pagamento_check
  CHECK (status_pagamento IN (
    'FINALIZADO',
    'AGUARDANDO',
    'CANCELADO',
    'PROGRAMADA',
    'FORMULARIO_PREENCHIDO'
  ));

-- 3. short_code + índice (igual 20260422b)
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS short_code TEXT;

CREATE INDEX IF NOT EXISTS idx_vendas_short_code ON vendas(short_code);

COMMENT ON COLUMN vendas.short_code IS 'short_code do link_compras que originou essa venda. NULL pra vendas criadas manualmente pelo admin.';

-- 4. Origem FORMULARIO + NAO_INFORMARAM preservado
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_origem_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_origem_check
  CHECK (origem IN ('ANUNCIO','RECOMPRA','INDICACAO','ATACADO','FORMULARIO','NAO_INFORMARAM'));

-- 5. origem_detalhe (igual 20260422b)
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS origem_detalhe TEXT;

COMMENT ON COLUMN vendas.origem_detalhe IS 'Texto livre de como o cliente conheceu a loja (Anúncio, Story, Direct, Indicação, etc). Só preenchido em vendas vindas do formulário /compra.';
