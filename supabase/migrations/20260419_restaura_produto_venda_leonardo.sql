-- Restaura produto da venda do Leonardo Saraiva (serial FW1Q12562F).
-- Contexto: PATCHes anteriores apagaram o campo produto durante tentativas de
-- edicao bugadas (admin digitava novo produto por cima sem clicar "Adicionar
-- ao carrinho", salvava, e o PATCH gravava produto vazio).
-- Identificacao unica pelo serial_no (imei redundante como seguranca).

UPDATE vendas
SET produto = 'APPLE WATCH ULTRA 2 49MM GPS+CEL BLACK TITANIUM PULSEIRA ONE SIZE PULSEIRA OCEAN PRETA'
WHERE serial_no = 'FW1Q12562F'
  AND imei = '358135792940100'
  AND (produto IS NULL OR produto = '' OR TRIM(produto) = '');
