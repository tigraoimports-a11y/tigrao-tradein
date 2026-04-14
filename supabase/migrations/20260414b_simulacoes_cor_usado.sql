-- Adicionar colunas cor_usado e cor_usado2 na tabela simulacoes
-- Necessário para que a cor selecionada pelo cliente no formulário de troca
-- apareça nos detalhes da simulação no admin
ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS cor_usado text;
ALTER TABLE simulacoes ADD COLUMN IF NOT EXISTS cor_usado2 text;
