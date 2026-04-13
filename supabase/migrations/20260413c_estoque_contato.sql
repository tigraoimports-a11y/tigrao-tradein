-- Adicionar campo contato (WhatsApp/telefone do cliente) na tabela estoque
-- Usado em pendências para agendar coletas com o telefone do cliente
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS contato TEXT;
