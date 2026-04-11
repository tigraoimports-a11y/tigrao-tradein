-- Data agendada para vendas programadas (priorizada sobre data de criação)
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS data_agendada date;
