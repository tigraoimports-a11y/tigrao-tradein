-- Adiciona campo taxa de entrega no link de compra
-- Valor variável definido pelo vendedor ao gerar o link
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS taxa_entrega NUMERIC DEFAULT 0;
