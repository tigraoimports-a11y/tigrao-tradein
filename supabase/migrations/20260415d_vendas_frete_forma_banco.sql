-- Adiciona campos de pagamento da taxa de entrega nas vendas
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_forma TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_banco TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_parcelas INTEGER;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_bandeira TEXT;
