-- Persiste se o pagamento ja foi efetuado (link ou pix) no link de compra
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS pagamento_pago text;
-- Valores: null (nao pago/pendente), 'link', 'pix'
