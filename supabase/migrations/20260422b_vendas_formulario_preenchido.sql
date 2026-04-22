-- Adiciona novo status 'FORMULARIO_PREENCHIDO' em vendas + coluna short_code
--
-- Motivo: cliente agora preenche o formulário público /compra e isso cria
-- automaticamente uma venda rascunho em vendas com status FORMULARIO_PREENCHIDO.
-- A equipe vê essas vendas na aba "📝 Formulários Preenchidos" de /admin/vendas,
-- confere os dados, completa o que faltar (estoque_id, etc) e clica
-- "Enviar para Vendas Pendentes" — aí o status muda para AGUARDANDO.
--
-- short_code permite deduplicar: se cliente submete de novo o mesmo formulário,
-- atualiza a venda existente em vez de criar duplicada. Também serve de ponte
-- entre vendas e link_compras (que já tem short_code como chave pública).

-- Novo status no enum
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_status_pagamento_check;

ALTER TABLE vendas ADD CONSTRAINT vendas_status_pagamento_check
  CHECK (status_pagamento IN (
    'FINALIZADO',
    'AGUARDANDO',
    'CANCELADO',
    'PROGRAMADA',
    'FORMULARIO_PREENCHIDO'
  ));

-- Linka com link_compras (mesma chave pública)
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Index pra buscar venda pelo short_code no webhook MP e nos updates
CREATE INDEX IF NOT EXISTS idx_vendas_short_code ON vendas(short_code);

COMMENT ON COLUMN vendas.short_code IS 'short_code do link_compras que originou essa venda. NULL pra vendas criadas manualmente pelo admin.';

-- Novo valor "FORMULARIO" no enum de origem (ANUNCIO/RECOMPRA/INDICACAO/ATACADO)
-- Marca vendas criadas automaticamente quando cliente preenche /compra.
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_origem_check;
ALTER TABLE vendas ADD CONSTRAINT vendas_origem_check
  CHECK (origem IN ('ANUNCIO','RECOMPRA','INDICACAO','ATACADO','FORMULARIO'));

-- Detalhe de origem que o cliente respondeu no formulário
-- (Anúncio / Story / Direct / Indicação / etc) — info qualitativa pra entender
-- de onde vêm os clientes. origem fica fixo em FORMULARIO, origem_detalhe varia.
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS origem_detalhe TEXT;

COMMENT ON COLUMN vendas.origem_detalhe IS 'Texto livre de como o cliente conheceu a loja (Anúncio, Story, Direct, Indicação, etc). Só preenchido em vendas vindas do formulário /compra.';
