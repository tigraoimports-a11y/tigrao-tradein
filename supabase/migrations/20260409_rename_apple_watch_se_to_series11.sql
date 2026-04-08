-- Renomeia Apple Watch SE 42mm/46mm para Series 11 (eram Series 11 cadastrados erradamente como SE)
-- Só afeta os tamanhos 42mm/46mm (SE real vem em 40mm/44mm)

update estoque
set produto = regexp_replace(produto, 'Apple Watch SE', 'Apple Watch Series 11', 'i')
where categoria = 'APPLE_WATCH'
  and produto ~* 'Apple Watch SE\s+4[26]\s*mm';
