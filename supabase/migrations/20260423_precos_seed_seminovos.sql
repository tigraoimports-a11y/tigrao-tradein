-- Migra os seminovos do JSONB `tradein_config.seminovos` pra rows da tabela
-- `precos` com tipo = 'SEMINOVO'. Depois dessa migration a aba "Valores
-- Seminovos" em /admin/precos passa a listar esses modelos, e o
-- /admin/simulacoes deixa de ser a fonte de verdade.
--
-- Safe pra rodar multiplas vezes: ON CONFLICT DO NOTHING evita duplicar
-- rows (a chave e modelo+armazenamento). Nao mexe no tradein_config antigo
-- — ele continua servindo de fallback no cliente ate o proximo PR de cleanup.
--
-- Mapeamento de categoria do JSONB -> categoria na tabela precos:
--   iphone  -> IPHONE_SEMINOVO
--   ipad    -> IPAD_SEMINOVO
--   macbook -> MACBOOK_SEMINOVO
--   watch   -> APPLE_WATCH_SEMINOVO

INSERT INTO precos (modelo, armazenamento, preco_pix, status, categoria, tipo, updated_at)
SELECT
  s.modelo::text                           AS modelo,
  v.storage::text                          AS armazenamento,
  COALESCE((v.preco)::numeric, 0)          AS preco_pix,
  CASE WHEN COALESCE(v.ativo, true) THEN 'ativo' ELSE 'esgotado' END AS status,
  CASE s.categoria
    WHEN 'iphone'  THEN 'IPHONE_SEMINOVO'
    WHEN 'ipad'    THEN 'IPAD_SEMINOVO'
    WHEN 'macbook' THEN 'MACBOOK_SEMINOVO'
    WHEN 'watch'   THEN 'APPLE_WATCH_SEMINOVO'
    ELSE 'IPHONE_SEMINOVO'
  END                                      AS categoria,
  'SEMINOVO'                               AS tipo,
  NOW()                                    AS updated_at
FROM tradein_config tc,
     jsonb_to_recordset(tc.seminovos) AS s(modelo text, ativo boolean, categoria text, variantes jsonb, storages jsonb, preco numeric),
     LATERAL (
       -- Normaliza pra variantes: se ja tem `variantes`, usa; senao converte
       -- o legado `storages[]` + `preco` (por modelo) em variantes ativas.
       SELECT x.storage, x.preco, x.ativo FROM jsonb_to_recordset(
         COALESCE(
           s.variantes,
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'storage', st,
               'preco', s.preco,
               'ativo', true
             )), '[]'::jsonb)
             FROM jsonb_array_elements_text(COALESCE(s.storages, '[]'::jsonb)) AS st
           )
         )
       ) AS x(storage text, preco numeric, ativo boolean)
     ) AS v
WHERE COALESCE(s.ativo, true) = true
  AND v.storage IS NOT NULL AND length(trim(v.storage)) > 0
ON CONFLICT (modelo, armazenamento) DO NOTHING;
