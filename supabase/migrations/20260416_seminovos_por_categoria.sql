-- ===========================================================
-- Modelos Seminovo por categoria + base para precificação futura
-- ===========================================================
-- Contexto:
--  Hoje o campo tradein_config.seminovos é um JSONB array de
--  { modelo, storages[], ativo }. Todos os modelos caem na mesma lista
--  independente da categoria, então ao trocar de aba (iPhone/iPad/MacBook/
--  Apple Watch) no admin, o cliente via iPhone em todas.
--
-- Esta migration:
--   1. Adiciona `categoria` (iphone | ipad | macbook | watch) em cada item.
--   2. Deixa `preco` disponível como campo opcional (não usado agora,
--      mas já reservado para futura precificação direta na UI).
--   3. Normaliza os itens existentes para categoria = 'iphone'
--      (porque hoje só existem iPhones cadastrados).
-- ===========================================================

-- 1) Garante que os itens existentes tenham categoria = 'iphone'
UPDATE tradein_config
SET seminovos = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'categoria' THEN elem
      ELSE elem || jsonb_build_object('categoria', 'iphone')
    END
  )
  FROM jsonb_array_elements(seminovos) AS elem
)
WHERE seminovos IS NOT NULL
  AND jsonb_typeof(seminovos) = 'array'
  AND jsonb_array_length(seminovos) > 0;

-- 2) Garante default vazio caso a linha ainda não tenha seminovos
UPDATE tradein_config
SET seminovos = '[]'::jsonb
WHERE seminovos IS NULL;

-- Obs.: O schema do JSONB agora suporta os campos:
--   { modelo: string, storages: string[], ativo: boolean,
--     categoria: 'iphone'|'ipad'|'macbook'|'watch',
--     preco?: number }
-- A validação fica na aplicação (TypeScript) — não precisa de CHECK no JSONB.

SELECT 'Migration 20260416_seminovos_por_categoria aplicada com sucesso!' AS resultado;
