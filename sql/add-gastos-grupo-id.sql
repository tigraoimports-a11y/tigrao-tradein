-- Adiciona coluna grupo_id na tabela gastos para permitir
-- dividir um pagamento entre múltiplos bancos.
-- Gastos do mesmo grupo compartilham o mesmo grupo_id.
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS grupo_id UUID;
CREATE INDEX IF NOT EXISTS idx_gastos_grupo ON gastos(grupo_id);
