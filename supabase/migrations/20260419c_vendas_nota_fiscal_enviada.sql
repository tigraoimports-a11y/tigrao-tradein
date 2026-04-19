-- Rastreia se a Nota Fiscal ja foi enviada por email ao cliente.
--
-- Antes, o envio era automatico toda vez que a venda ficava com status
-- FINALIZADO. Como edicoes de venda sao comuns, isso spammava o cliente
-- com NFs duplicadas. Agora o envio vira MANUAL — admin anexa a NF e
-- clica "Enviar NF". Esse campo marca que o envio ja foi feito pra NAO
-- mostrar mais "envio pendente" nem permitir reenvio acidental.
--
-- Vendas antigas ficam default false. Admin pode marcar manualmente como
-- enviada via UI ou rodar um backfill de vendas finalizadas com NF anexa.

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS nota_fiscal_enviada BOOLEAN DEFAULT FALSE;

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS nota_fiscal_enviada_em TIMESTAMPTZ;

COMMENT ON COLUMN vendas.nota_fiscal_enviada IS 'Se a NF anexa foi enviada por email ao cliente';
COMMENT ON COLUMN vendas.nota_fiscal_enviada_em IS 'Timestamp do envio da NF (null se nao enviada)';

-- Backfill: vendas que ja foram FINALIZADAS com NF anexa provavelmente
-- tiveram o email disparado pelo fluxo antigo automatico. Marca como
-- enviadas pra nao aparecer "pendente" em historico.
UPDATE vendas
SET nota_fiscal_enviada = TRUE,
    nota_fiscal_enviada_em = updated_at
WHERE nota_fiscal_url IS NOT NULL
  AND status_pagamento = 'FINALIZADO'
  AND nota_fiscal_enviada = FALSE;
