-- Adiciona campos de pagamento da taxa de entrega nas vendas
-- frete_forma: texto descritivo (ex: "PIX", "CARTAO 3x VISA", "LINK 6x", "DEBITO")
-- frete_banco: banco/maquina (ex: "ITAU", "INFINITE", "MERCADO_PAGO")
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_forma TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS frete_banco TEXT;
