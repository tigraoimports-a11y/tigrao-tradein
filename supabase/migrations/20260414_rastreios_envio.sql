-- Códigos de rastreio a nível de pedido/envio (origem + data de compra)
-- Em vez de amarrar o código a um produto específico, amarra ao "pacote logístico"
-- (ex: 14 produtos de SP comprados no mesmo dia, enviados em 5 caixas).

CREATE TABLE IF NOT EXISTS rastreios_envio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_compra TEXT NOT NULL,
  data_compra DATE NOT NULL,
  codigo_rastreio TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origem_compra, data_compra, codigo_rastreio)
);

CREATE INDEX IF NOT EXISTS idx_rastreios_envio_origem_data
  ON rastreios_envio (origem_compra, data_compra);
