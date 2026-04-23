-- Adiciona coluna `campanha` em link_compras pra rastrear origem dos links
-- (ex: "Instagram Stories", "Anúncio Meta - Lookalike 1%", "Indicação Carlos").
-- Cada link gerado em /admin/gerar-link pode receber uma tag livre que vendedor
-- preenche, e analytics futuras podem agrupar vendas por campanha.

ALTER TABLE link_compras
  ADD COLUMN IF NOT EXISTS campanha TEXT;

CREATE INDEX IF NOT EXISTS idx_link_compras_campanha ON link_compras(campanha) WHERE campanha IS NOT NULL;
