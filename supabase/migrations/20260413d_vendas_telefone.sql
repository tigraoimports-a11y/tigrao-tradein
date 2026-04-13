-- Adicionar campo telefone/WhatsApp do cliente na tabela vendas
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS telefone TEXT;
