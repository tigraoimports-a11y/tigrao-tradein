-- ============================================================
-- Fluxo invertido (formulário → pagamento MP)
-- ============================================================
-- Cliente preenche /compra ANTES de pagar o Link MP. No clique de
-- "Pagar com Mercado Pago", o servidor:
--   1. Cria/atualiza link_compras com todos os dados do formulário
--      (campos fixos + cliente_dados_preenchidos JSONB com o resto)
--   2. Cria preference MP com external_reference = short_code
--   3. Redireciona cliente pro checkout MP
--
-- Quando o webhook MP confirma pagamento, já temos TODOS os dados pra
-- montar a notificação completa pro grupo (sem depender do cliente
-- terminar o fluxo de "Enviar WhatsApp").
--
-- Campos adicionados:
--   • desconto        — desconto aplicado no pedido (aparece na msg)
--   • mp_payment_id   — ID do payment MP (populado pelo webhook — útil pra
--                       auditoria e pra evitar duplicata em reenvios)
-- ============================================================

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) DEFAULT 0;

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_link_compras_mp_payment_id
  ON link_compras(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
