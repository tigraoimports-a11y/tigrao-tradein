-- Adiciona coluna desconto à tabela link_compras
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) DEFAULT 0;

-- Detalhes estruturados da troca (condição, cor)
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS troca_condicao TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS troca_cor TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS troca_condicao2 TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS troca_cor2 TEXT;

-- Condição do 2º aparelho na simulação
ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS condicao_linhas2 TEXT[];
