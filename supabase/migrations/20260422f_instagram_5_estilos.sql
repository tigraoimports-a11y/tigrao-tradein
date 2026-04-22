-- Expande a constraint de instagram_posts.estilo pra incluir 5 novos modelos
-- de linguagem além de PADRAO e EMANUEL_PESSOA.
--
-- Estilos novos:
--   CARIOCA_DESCONTRAIDO  — papo de balcão, gíria carioca leve (lançamento/novidade)
--   STORYTELLING_PREMIUM  — narrativa cinematográfica Apple Keynote (review)
--   COMPARATIVO_TECNICO   — dados duros, direto ao ponto (comparativos)
--   VIRAL_POLEMICO        — hot-take, controvérsia calculada (engajamento)
--   EDUCATIVO_DIDATICO    — professor gente boa, passo-a-passo (tutorial)

alter table instagram_posts
  drop constraint if exists instagram_posts_estilo_check;

alter table instagram_posts
  add constraint instagram_posts_estilo_check
  check (estilo in (
    'PADRAO',
    'EMANUEL_PESSOA',
    'CARIOCA_DESCONTRAIDO',
    'STORYTELLING_PREMIUM',
    'COMPARATIVO_TECNICO',
    'VIRAL_POLEMICO',
    'EDUCATIVO_DIDATICO'
  ));
