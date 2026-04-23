-- Sync retroativo: venda da MARIA FERNANDA QUINTANILHA GRUNERT tem troca_serial/imei
-- antigos (FNPMWF7V46 / 350056836065126) porque foram salvos no momento da venda.
-- O serial/IMEI corretos foram atualizados na aba Pendencias (estoque) mas nao propagaram
-- pra venda — bug corrigido em paralelo no PATCH /api/estoque.
-- Essa migration faz o sync manual desse caso especifico.

UPDATE vendas
SET troca_serial = 'J3WPGWRP2H',
    troca_imei   = '358824780919628'
WHERE troca_serial = 'FNPMWF7V46'
  AND troca_imei   = '350056836065126';
