-- Adiciona segundo PIX opcional nas vendas: permite dividir o valor recebido
-- entre dois bancos. Semantica:
--   entrada_pix_2 : valor do segundo PIX (sempre opcional). Subtrai do valor
--     que iria pro banco principal e adiciona no banco_pix_2.
--   banco_pix_2   : banco de destino desse segundo PIX (ITAU/INFINITE/MP).
-- Exemplo: venda PIX de R$ 2000 com entrada_pix_2=500 e banco_pix_2=INFINITE
--   → banco principal recebe 1500, INFINITE recebe 500.
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS entrada_pix_2 NUMERIC DEFAULT 0;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS banco_pix_2 TEXT;
