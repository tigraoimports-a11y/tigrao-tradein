-- Fix crédito da LOJA SIRI na venda do IPHONE 17 256GB WHITE (serial K76DFL620H)
-- Crédito usado: R$ 4.060, PIX pago: R$ 890
UPDATE vendas
SET credito_lojista_usado = 4060
WHERE serial_no = 'K76DFL620H'
  AND cliente = 'LOJA SIRI'
  AND (credito_lojista_usado IS NULL OR credito_lojista_usado = 0);
