-- Drop-off detalhado do funil (Abr/2026 — item #20)
--
-- Adiciona dimensoes em tradein_analytics pra cruzar drop-off com:
--   - canal de aquisicao (UTM source/medium/campaign — capturado de localStorage)
--   - tipo de dispositivo (iphone/ipad/macbook/watch — selecionado no Step 0)
--
-- Antes a tabela so guardava session_id + event + step + question, o que mostra
-- AGREGADO. Agora da pra responder:
--   - "Quem vem de Meta Ads desiste mais que Instagram organico?"
--   - "Apple Watch tem 90% drop-off no Step 1, iPhone so 30% — UX desalinhada"
--   - "Sessao X parou no step Y na pergunta Z" (debug fino)
--
-- Backwards compat: colunas sao TODAS opcionais. Eventos antigos (sem UTM/device)
-- ficam NULL e aparecem em "Sem origem" / "Outros" nos breakdowns.

-- Garantir que a tabela existe (criada manualmente ha tempos — sem migration historica)
CREATE TABLE IF NOT EXISTS tradein_analytics (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event TEXT NOT NULL,
  step NUMERIC,
  question TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tradein_analytics
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- Indexes pra queries do /admin/analytics ficarem rapidas
CREATE INDEX IF NOT EXISTS idx_tradein_analytics_session ON tradein_analytics (session_id);
CREATE INDEX IF NOT EXISTS idx_tradein_analytics_created ON tradein_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tradein_analytics_utm_source ON tradein_analytics (utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tradein_analytics_device_type ON tradein_analytics (device_type) WHERE device_type IS NOT NULL;

COMMENT ON COLUMN tradein_analytics.device_type IS 'Tipo de aparelho que o cliente esta trocando (iphone|ipad|macbook|watch). NULL pra eventos do site_view antes do cliente escolher.';
COMMENT ON COLUMN tradein_analytics.utm_source IS 'Canal de aquisicao capturado da URL de entrada (meta, instagram, google, etc). NULL pra trafego direto/organico.';
