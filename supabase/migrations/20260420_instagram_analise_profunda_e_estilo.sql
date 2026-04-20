-- Instagram: adiciona tipo ANALISE_PROFUNDA, expande numero_slides ate 14
-- e adiciona coluna estilo (PADRAO | EMANUEL_PESSOA) que controla tom de voz,
-- parser de negrito no texto e layout visual do slide.

-- 1) Expande constraint de tipo: inclui ANALISE_PROFUNDA
alter table instagram_posts
  drop constraint if exists instagram_posts_tipo_check;
alter table instagram_posts
  add constraint instagram_posts_tipo_check
  check (tipo in ('DICA', 'COMPARATIVO', 'NOTICIA', 'ANALISE_PROFUNDA'));

-- 2) Expande numero_slides de 3-10 pra 3-14 (suporta carrossel longo tipo Emanuel Pessoa)
alter table instagram_posts
  drop constraint if exists instagram_posts_numero_slides_check;
alter table instagram_posts
  add constraint instagram_posts_numero_slides_check
  check (numero_slides between 3 and 14);

-- 3) Coluna estilo: controla linguagem + layout visual
alter table instagram_posts
  add column if not exists estilo text not null default 'PADRAO';

alter table instagram_posts
  drop constraint if exists instagram_posts_estilo_check;
alter table instagram_posts
  add constraint instagram_posts_estilo_check
  check (estilo in ('PADRAO', 'EMANUEL_PESSOA'));
