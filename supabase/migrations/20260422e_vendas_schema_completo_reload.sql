-- Solução DEFINITIVA pro /compra → from-formulario → contrato-auto.
--
-- Sintoma: erros PGRST204 em cascata — cada chamada falha em uma coluna
-- diferente (primeiro 'cor', depois 'origem_detalhe', agora 'troca_valor').
-- Causa: o schema cache do PostgREST ficou stale depois das migrations
-- anteriores que reescreveram constraints. Como cada worker do PostgREST
-- tem cache próprio, chamadas diferentes batem em workers com cache em
-- estados diferentes.
--
-- Solução:
--   1. Garantir (IF NOT EXISTS) que TODAS as colunas usadas pelo payload
--      do from-formulario existem na tabela vendas. Se já existem, é no-op.
--   2. Forçar o PostgREST a recarregar o schema cache via NOTIFY
--      (comando documentado pelo PostgREST — todas as instâncias escutam
--      esse canal).
--
-- Depois dessa migration, o INSERT do from-formulario não deve mais
-- encontrar coluna "faltando" em nenhum worker.

-- 1. Cliente
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cliente TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cep TEXT;

-- 2. Produto / pagamento
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS produto TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS preco_vendido NUMERIC;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS forma TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS banco TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS recebimento TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS qnt_parcelas INTEGER;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS sinal_antecipado NUMERIC;

-- 3. Troca — aparelho 1
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS produto_na_troca TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_produto TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_cor TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_valor NUMERIC;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_caixa TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_serial TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_imei TEXT;

-- 4. Troca — aparelho 2
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_produto2 TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_cor2 TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_valor2 NUMERIC;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_caixa2 TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_serial2 TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS troca_imei2 TEXT;

-- 5. Origem / metadados
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS origem TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS origem_detalhe TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS vendedor TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS estoque_id UUID;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS short_code TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS status_pagamento TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS data DATE;

-- 6. Força o PostgREST a recarregar o schema cache imediatamente
-- (documentado em https://postgrest.org/en/stable/references/schema_cache.html)
NOTIFY pgrst, 'reload schema';
