-- Adiciona colunas UTM em simulacoes (tradein_leads), vendas e link_compras pra
-- rastrear de onde veio o cliente (Meta Ads, Google, Instagram orgânico, etc).
--
-- Regra: capturado client-side via lib/utm-tracker quando cliente chega em
-- qualquer pagina de entrada (/, /troca, /compra, /produto/[slug]). Persistido
-- em localStorage por 30 dias e injetado em todo POST de simulacao/venda.

-- simulacoes (tabela tradein_leads — guarda cada simulacao trade-in finalizada)
ALTER TABLE simulacoes
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT;

CREATE INDEX IF NOT EXISTS idx_simulacoes_utm_source
  ON simulacoes(utm_source, created_at DESC) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_simulacoes_utm_campaign
  ON simulacoes(utm_campaign, created_at DESC) WHERE utm_campaign IS NOT NULL;

-- vendas
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT;

CREATE INDEX IF NOT EXISTS idx_vendas_utm_source
  ON vendas(utm_source, created_at DESC) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendas_utm_campaign
  ON vendas(utm_campaign, created_at DESC) WHERE utm_campaign IS NOT NULL;

-- link_compras: util quando vendedor mandar link pra cliente que ja foi
-- atribuido a uma campanha de aquisicao
ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT;
