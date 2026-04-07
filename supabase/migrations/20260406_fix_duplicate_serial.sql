-- Corrigir duplicidade do serial G0NF5T3L0D52:
-- Existe item EM ESTOQUE e venda registrada com mesmo serial.
-- Marcar o item EM ESTOQUE como ESGOTADO (qnt=0).
UPDATE estoque
SET qnt = 0,
    status = 'ESGOTADO',
    updated_at = NOW()
WHERE serial_no = 'G0NF5T3L0D52'
  AND status = 'EM ESTOQUE';
