-- Corrigir produtos vendidos que ficaram como EM ESTOQUE
-- Caso: DQ5Y9DWL2W foi vendido para MARCELA mas não foi marcado como ESGOTADO
UPDATE estoque e
SET status = 'ESGOTADO', qnt = 0, updated_at = NOW()
FROM vendas v
WHERE v.serial_no = e.serial_no
  AND e.status = 'EM ESTOQUE'
  AND e.serial_no IS NOT NULL
  AND v.status_pagamento NOT IN ('CANCELADO');
