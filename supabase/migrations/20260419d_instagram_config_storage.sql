-- PR 2 do Instagram: render visual + foto de perfil + imagens por slide.
--
-- 1) Tabela de configuracao singleton (foto do rosto do Andre, etc).
-- 2) Bucket publico no Storage pra assets (foto + PNGs renderizados).
-- 3) Campo imagem_url por slide fica dentro do proprio slides_json (jsonb),
--    nao precisa alterar a tabela instagram_posts.

create table if not exists instagram_config (
  id int primary key default 1,
  foto_perfil_url text,
  nome_display text default 'tigraoimports',
  updated_at timestamptz not null default now(),
  constraint instagram_config_singleton check (id = 1)
);

insert into instagram_config (id, nome_display) values (1, 'tigraoimports')
on conflict (id) do nothing;

grant all on table instagram_config to service_role;
grant all on table instagram_config to postgres;
grant all on table instagram_config to authenticated;
alter table instagram_config disable row level security;

-- Bucket de assets do Instagram. Publico pra nao precisar gerar signed URLs na
-- hora de renderizar slides ou mandar pro Instagram Graph API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instagram-assets',
  'instagram-assets',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Permite leitura publica (nao precisa de policy pra leitura quando public=true,
-- mas policies de insert/update/delete ainda sao necessarias se RLS estiver on).
-- Como o service role bypassa RLS, o backend opera normal via API.
