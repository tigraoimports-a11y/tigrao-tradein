-- Tabela de posts automatizados para Instagram (carrossel).
-- PR 1: fundação + geração de texto. Campos de imagem e postagem ficam prontos
-- mas só são usados nos PRs seguintes.

create table if not exists instagram_posts (
  id uuid primary key default gen_random_uuid(),

  -- Input do usuário
  tema text not null,
  tipo text not null default 'DICA', -- DICA | COMPARATIVO | NOTICIA
  numero_slides int not null default 7, -- entre 5 e 7

  -- Fluxo: RASCUNHO → GERANDO → GERADO → APROVADO → AGENDADO → POSTADO
  -- ERRO em qualquer ponto marca falha; mensagem fica em "erro".
  status text not null default 'RASCUNHO',

  -- Resultado da pesquisa/geração (Claude)
  pesquisa_json jsonb,  -- { fontes: [...], fatos_verificados: [...] }
  slides_json jsonb,    -- [{ titulo, texto, destaque? }]
  legenda text,
  hashtags text[],

  -- Fase 2 (renderização de imagens) — preenchido no próximo PR
  imagens_urls text[],

  -- Fase 3 (postagem automática) — preenchido no próximo PR
  agendado_para timestamptz,
  postado_em timestamptz,
  instagram_post_id text,

  erro text,
  criado_por text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint instagram_posts_tipo_check check (tipo in ('DICA', 'COMPARATIVO', 'NOTICIA')),
  constraint instagram_posts_status_check check (status in ('RASCUNHO', 'GERANDO', 'GERADO', 'APROVADO', 'AGENDADO', 'POSTADO', 'ERRO')),
  constraint instagram_posts_numero_slides_check check (numero_slides between 3 and 10)
);

create index if not exists idx_instagram_posts_status on instagram_posts(status);
create index if not exists idx_instagram_posts_agendado on instagram_posts(agendado_para) where agendado_para is not null;
create index if not exists idx_instagram_posts_created on instagram_posts(created_at desc);

grant all on table instagram_posts to service_role;
grant all on table instagram_posts to postgres;
grant all on table instagram_posts to authenticated;
alter table instagram_posts disable row level security;
