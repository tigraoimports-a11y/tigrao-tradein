-- 1) Limpa corrupção causada por renames anteriores: "SERIES 11RIES 11" → "SERIES 11"
update estoque
set produto = replace(replace(produto, 'SERIES 11RIES 11', 'SERIES 11'), 'Series 11RIES 11', 'Series 11')
where categoria = 'APPLE_WATCH'
  and produto ilike '%11RIES 11%';

-- Repete pra cobrir múltiplas iterações de corrupção
update estoque
set produto = replace(replace(produto, 'SERIES 11RIES 11', 'SERIES 11'), 'Series 11RIES 11', 'Series 11')
where categoria = 'APPLE_WATCH'
  and produto ilike '%11RIES 11%';

update estoque
set produto = replace(replace(produto, 'SERIES 11RIES 11', 'SERIES 11'), 'Series 11RIES 11', 'Series 11')
where categoria = 'APPLE_WATCH'
  and produto ilike '%11RIES 11%';

-- 2) Renomeia Apple Watch SE 42/46mm → Series 11 usando word boundary (\y)
-- pra NÃO casar o "SE" dentro de "SERIES"
update estoque
set produto = regexp_replace(produto, '\yApple Watch SE\y', 'Apple Watch Series 11', 'gi')
where categoria = 'APPLE_WATCH'
  and produto ~* '\yApple Watch SE\y\s*4[26]\s*mm';
