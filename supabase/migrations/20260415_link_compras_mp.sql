-- Adiciona campos específicos do Mercado Pago na tabela de histórico de links.
-- Quando o admin gera um "Link MP" em /admin/gerar-link, o registro agora vai
-- parar no histórico (igual links comuns) junto com:
--   • mp_link — URL de checkout do Mercado Pago (init_point)
--   • mp_preference_id — ID da preference MP (rastreável via webhook)
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS mp_link TEXT;
ALTER TABLE link_compras ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;

CREATE INDEX IF NOT EXISTS idx_link_compras_mp_preference_id
  ON link_compras(mp_preference_id)
  WHERE mp_preference_id IS NOT NULL;
