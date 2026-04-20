-- Completa a ligacao do iPhone 13 BRANCO (PTPH95XXQH) com a cliente de origem.
--
-- O produto veio do trade-in da TAMARA ROMANO BEZERRA (venda upgrade 20/03).
-- Apos a migration 20260420_ corrigir a venda do Paulo Vidal e a troca da Tamara,
-- falta ligar o registro do estoque a Tamara como fornecedora/cliente de origem
-- (mesmo padrao usado quando a pendencia eh criada automaticamente via vendas).

UPDATE estoque
SET
  cliente    = 'TAMARA ROMANO BEZERRA',
  fornecedor = 'TAMARA ROMANO BEZERRA',
  updated_at = NOW()
WHERE serial_no = 'PTPH95XXQH'
  AND (cliente IS DISTINCT FROM 'TAMARA ROMANO BEZERRA'
       OR fornecedor IS DISTINCT FROM 'TAMARA ROMANO BEZERRA');
