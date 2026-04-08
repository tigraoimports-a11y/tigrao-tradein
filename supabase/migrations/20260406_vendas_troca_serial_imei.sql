-- Adicionar colunas completas da troca na tabela vendas
-- para persistir TODOS os dados do produto da troca direto na venda
-- (espelhando os campos da pendência em estoque)
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS troca_categoria TEXT,
  ADD COLUMN IF NOT EXISTS troca_serial    TEXT,
  ADD COLUMN IF NOT EXISTS troca_imei      TEXT,
  ADD COLUMN IF NOT EXISTS troca_grade     TEXT,
  ADD COLUMN IF NOT EXISTS troca_caixa     TEXT,
  ADD COLUMN IF NOT EXISTS troca_cabo      TEXT,
  ADD COLUMN IF NOT EXISTS troca_fonte     TEXT,
  ADD COLUMN IF NOT EXISTS troca_pulseira  TEXT,
  ADD COLUMN IF NOT EXISTS troca_ciclos    TEXT,
  ADD COLUMN IF NOT EXISTS troca_garantia  TEXT,
  ADD COLUMN IF NOT EXISTS troca_categoria2 TEXT,
  ADD COLUMN IF NOT EXISTS troca_serial2    TEXT,
  ADD COLUMN IF NOT EXISTS troca_imei2      TEXT,
  ADD COLUMN IF NOT EXISTS troca_grade2     TEXT,
  ADD COLUMN IF NOT EXISTS troca_caixa2     TEXT,
  ADD COLUMN IF NOT EXISTS troca_cabo2      TEXT,
  ADD COLUMN IF NOT EXISTS troca_fonte2     TEXT,
  ADD COLUMN IF NOT EXISTS troca_pulseira2  TEXT,
  ADD COLUMN IF NOT EXISTS troca_ciclos2    TEXT,
  ADD COLUMN IF NOT EXISTS troca_garantia2  TEXT;
