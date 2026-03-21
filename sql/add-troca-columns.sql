-- Adicionar colunas de troca na tabela vendas
-- André: rode isso no SQL Editor do Supabase

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS troca_produto TEXT,
  ADD COLUMN IF NOT EXISTS troca_cor TEXT,
  ADD COLUMN IF NOT EXISTS troca_bateria TEXT,
  ADD COLUMN IF NOT EXISTS troca_obs TEXT;
