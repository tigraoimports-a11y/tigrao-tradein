-- Opt-out de WhatsApp: cliente pediu pra não receber mais mensagens
ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS opt_out_whatsapp BOOLEAN DEFAULT FALSE;
