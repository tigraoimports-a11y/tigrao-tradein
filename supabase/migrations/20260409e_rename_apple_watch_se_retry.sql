-- Renomeia Apple Watch SE 42/46mm → Series 11 no estoque (inclui itens A CAMINHO)
-- Usa word boundary \y pra não casar "SE" dentro de "SERIES"
update estoque
set produto = regexp_replace(produto, '\yApple Watch SE\y', 'Apple Watch Series 11', 'gi'),
    updated_at = now()
where categoria = 'APPLE_WATCH'
  and produto ~* '\yApple Watch SE\y'
  and produto ~* '4[26]\s*mm';
