-- Cobranca extra opcional no link_compras: capa, pelicula, brinde, etc.
-- Operador descreve + valor, soma no total do link. Cliente ve no /compra
-- junto com o produto. Responsavel ve no historico do gerar-link.

ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS extra_descricao TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS extra_valor NUMERIC(10,2);
