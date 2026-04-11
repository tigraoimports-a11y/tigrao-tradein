-- Permite marcar vendas como brinde/cortesia (não impacta faturamento/lucro)
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS is_brinde boolean DEFAULT false;
