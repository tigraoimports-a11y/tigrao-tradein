-- Adiciona forma de pagamento e banco para a taxa de entrega nas vendas
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_forma TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_banco TEXT;
