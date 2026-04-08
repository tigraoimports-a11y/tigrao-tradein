-- Renomeia qualquer Apple Watch SE 42mm ou 46mm para Series 11
-- Matching amplo e case-insensitive, sem depender de \s+

update estoque
set produto = replace(replace(produto, 'Apple Watch SE', 'Apple Watch Series 11'), 'APPLE WATCH SE', 'APPLE WATCH SERIES 11')
where categoria = 'APPLE_WATCH'
  and (produto ilike '%Apple Watch SE%42%mm%' or produto ilike '%Apple Watch SE%46%mm%');
