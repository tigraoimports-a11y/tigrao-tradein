-- Índice único parcial: impede dois registros com mesmo serial_no quando ambos estão ativos (não ESGOTADO)
-- Isso garante que um serial só pode existir uma vez no estoque enquanto não for vendido
CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_serial_no_ativo
  ON estoque (serial_no)
  WHERE serial_no IS NOT NULL AND status != 'ESGOTADO';
