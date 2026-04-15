-- Adiciona campos pra rastrear se a notificação de pagamento aprovado
-- já foi enviada pro grupo do WhatsApp (via Z-API, em /api/mp-webhook).
--
-- Evita duplicação quando o Mercado Pago reenvia webhooks pro mesmo
-- pagamento (comportamento comum quando a resposta 200 demora).
ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS notificado_pago BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS notificado_pago_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_link_compras_notificado_pago
  ON link_compras(notificado_pago)
  WHERE notificado_pago = FALSE;
