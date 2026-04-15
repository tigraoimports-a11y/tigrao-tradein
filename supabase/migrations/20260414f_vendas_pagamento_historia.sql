-- Histórico de pagamentos por venda (usado em vendas programadas com múltiplos pagamentos)
-- Cada item: { tipo, valor, data, forma, banco, obs? }
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS pagamento_historia JSONB DEFAULT '[]'::jsonb;
