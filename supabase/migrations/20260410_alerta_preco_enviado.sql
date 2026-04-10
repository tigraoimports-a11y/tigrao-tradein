-- Coluna para marcar que o alerta de queda de preço já foi enviado
ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS alerta_preco_enviado BOOLEAN DEFAULT FALSE;
