-- Adiciona coluna whatsapp_destino em simulacoes para rastrear para qual
-- numero de WhatsApp o formulario foi enviado. Serve de auditoria: permite
-- ao admin ver em /admin/simulacoes se o lead foi pro Nicolas, Bianca,
-- Andre ou vendedor especifico.
--
-- Preenchido pelo POST /api/leads com o numero que o cliente clicou.
-- NULL em linhas antigas (anteriores a esta migration).

ALTER TABLE simulacoes
  ADD COLUMN IF NOT EXISTS whatsapp_destino TEXT;

COMMENT ON COLUMN simulacoes.whatsapp_destino IS
  'Numero de WhatsApp (E.164 sem +) para onde o formulario foi enviado. Ex: 5521995618747 (Nicolas).';
