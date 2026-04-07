-- Adiciona cor do aparelho usado nas simulações/leads do trade-in
-- (campo pedido pela Bianca pra vir preenchido sem precisar pedir depois)

ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS cor_usado text;
ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS cor_usado2 text;

COMMENT ON COLUMN simulacoes.cor_usado IS 'Cor informada pelo cliente do 1º aparelho na troca.';
COMMENT ON COLUMN simulacoes.cor_usado2 IS 'Cor informada pelo cliente do 2º aparelho na troca (quando houver).';
