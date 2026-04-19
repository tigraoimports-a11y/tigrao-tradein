-- Restaura produto da venda do Leonardo Saraiva (serial FW1Q12562F).
--
-- Contexto: o item fisico eh APPLE WATCH ULTRA 3 49MM GPS PRETO PULSEIRA OCEAN
-- PRETA (conforme estoque), mas a venda foi criada com nome errado "Ultra 2"
-- e depois zerada por PATCHes bugados de edicao.
--
-- Restaura o nome correto (Ultra 3) conforme o registro de estoque do serial
-- FW1Q12562F. Identifica pelo serial_no (unico) + imei como seguranca extra.

UPDATE vendas
SET produto = 'APPLE WATCH ULTRA 3 49MM GPS PRETO PULSEIRA OCEAN PRETA'
WHERE serial_no = 'FW1Q12562F'
  AND imei = '358135792940100';
