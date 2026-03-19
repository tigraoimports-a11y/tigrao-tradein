-- Atualizar tabela estoque para suportar seminovos e produtos a caminho
-- Rodar no SQL Editor do Supabase

-- Adicionar coluna tipo (NOVO, SEMINOVO, A_CAMINHO)
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'NOVO' CHECK (tipo IN ('NOVO','SEMINOVO','A_CAMINHO'));

-- Adicionar coluna bateria (para seminovos)
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS bateria INTEGER;

-- Adicionar coluna data_compra
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS data_compra DATE;

-- Adicionar coluna cliente (para seminovos comprados de clientes)
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS cliente TEXT;

-- Remover constraint UNIQUE antiga e criar nova sem cor obrigatória
-- (para permitir mesmo produto com observações diferentes em seminovos)
ALTER TABLE estoque DROP CONSTRAINT IF EXISTS estoque_produto_cor_key;

-- Criar index para tipo
CREATE INDEX IF NOT EXISTS idx_estoque_tipo ON estoque(tipo);

SELECT 'Tabela estoque atualizada!' AS resultado;
