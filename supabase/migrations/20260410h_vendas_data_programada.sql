-- Campo para agendar vendas com entrega futura
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS data_programada DATE;
