-- Adiciona campos ZapSign na tabela termos_procedencia
--
-- Motivo: integrar assinatura digital com validade juridica via ZapSign.
-- Cliente recebe link pelo WhatsApp, autentica via SMS e assina o termo.
-- Webhook do ZapSign notifica o sistema quando assinado.

ALTER TABLE termos_procedencia
  ADD COLUMN IF NOT EXISTS zapsign_doc_token TEXT,
  ADD COLUMN IF NOT EXISTS zapsign_signer_token TEXT,
  ADD COLUMN IF NOT EXISTS zapsign_sign_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT;

CREATE INDEX IF NOT EXISTS idx_termos_procedencia_zapsign_doc ON termos_procedencia(zapsign_doc_token);

COMMENT ON COLUMN termos_procedencia.zapsign_doc_token IS 'Token do documento no ZapSign';
COMMENT ON COLUMN termos_procedencia.zapsign_signer_token IS 'Token do signatario no ZapSign';
COMMENT ON COLUMN termos_procedencia.zapsign_sign_url IS 'URL que o cliente acessa pra assinar';
COMMENT ON COLUMN termos_procedencia.signed_at IS 'Timestamp de quando o cliente assinou';
COMMENT ON COLUMN termos_procedencia.signed_pdf_url IS 'URL do PDF assinado no ZapSign (com trilha de auditoria)';
