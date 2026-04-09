-- Renomeia Apple Watch SE no catálogo para Series 11
-- (42/46mm era cadastrado como SE mas na verdade é a linha Series 11)
update catalogo_modelos
set nome = 'Apple Watch Series 11'
where categoria_key = 'APPLE_WATCH'
  and nome ilike '%Apple Watch SE%3rd%';

-- Remove a entrada SE 2nd gen (obsoleta — não vendida mais)
-- Se quiser manter, comente esta linha
delete from catalogo_modelos
where categoria_key = 'APPLE_WATCH'
  and nome ilike '%Apple Watch SE%2rd%';
