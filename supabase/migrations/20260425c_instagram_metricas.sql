-- Metricas pos-publicacao Instagram (Abr/2026 — item #25)
--
-- Adiciona colunas pra guardar metricas que vem da Graph API depois do post
-- estar publicado. Atualizado on-demand via /api/admin/instagram/[id]/fetch-metrics
-- ou em batch via /api/admin/instagram/sync-metrics.
--
-- Metricas suportadas:
--   metricas_likes        -- curtidas
--   metricas_comments     -- comentarios
--   metricas_reach        -- contas alcancadas (UNICAS, nao impressions)
--   metricas_saves        -- salvamentos
--   metricas_shares       -- compartilhamentos
--   metricas_views        -- visualizacoes (Reels/Video — opcional)
--   metricas_atualizado_em -- quando foi a ultima sincronizacao
--
-- Por que nao guardar como JSONB?
-- Queries do tipo "top 10 posts por reach" ficam triviais com colunas, e
-- as metricas que a gente acompanha sao estaveis (5-7 metricas). JSONB so
-- serviria pra metricas extras esoter

ALTER TABLE instagram_posts
  ADD COLUMN IF NOT EXISTS metricas_likes INT,
  ADD COLUMN IF NOT EXISTS metricas_comments INT,
  ADD COLUMN IF NOT EXISTS metricas_reach INT,
  ADD COLUMN IF NOT EXISTS metricas_saves INT,
  ADD COLUMN IF NOT EXISTS metricas_shares INT,
  ADD COLUMN IF NOT EXISTS metricas_views INT,
  ADD COLUMN IF NOT EXISTS metricas_atualizado_em TIMESTAMPTZ;

-- Indice pra queries do tipo "top performers" no admin
CREATE INDEX IF NOT EXISTS idx_instagram_posts_metricas_reach
  ON instagram_posts (metricas_reach DESC NULLS LAST)
  WHERE metricas_reach IS NOT NULL;

COMMENT ON COLUMN instagram_posts.metricas_likes IS 'Curtidas — atualizado via Graph API on-demand';
COMMENT ON COLUMN instagram_posts.metricas_reach IS 'Contas unicas alcancadas (nao impressions, que conta visualizacoes repetidas)';
COMMENT ON COLUMN instagram_posts.metricas_atualizado_em IS 'Ultima sincronizacao com a Graph API';
