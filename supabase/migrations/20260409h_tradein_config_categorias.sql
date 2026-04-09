-- Configurações de avaliação de trade-in por categoria
-- Controla: modo (automatico/manual), ativo (visível pro cliente ou não)
create table if not exists tradein_categoria_config (
  categoria text primary key, -- 'IPHONE', 'IPAD', 'MACBOOK', 'APPLE_WATCH'
  modo text not null default 'automatico', -- 'automatico' | 'manual'
  ativo boolean not null default true, -- se false, categoria não aparece no formulário público
  updated_at timestamptz not null default now()
);

-- Seed com valores padrão
insert into tradein_categoria_config (categoria, modo, ativo) values
  ('IPHONE', 'automatico', true),
  ('IPAD', 'manual', true),
  ('MACBOOK', 'manual', true),
  ('APPLE_WATCH', 'manual', true)
on conflict (categoria) do nothing;

-- Grants
grant all on table tradein_categoria_config to service_role;
grant all on table tradein_categoria_config to postgres;
grant all on table tradein_categoria_config to authenticated;
alter table tradein_categoria_config disable row level security;

-- Garantia individual por modelo/armazenamento
-- Separada da descontos_condicao pra ter granularidade modelo+armazenamento
create table if not exists tradein_garantia (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  armazenamento text not null,
  valor_garantia numeric not null default 0, -- valor adicionado quando tem garantia ativa
  updated_at timestamptz not null default now(),
  unique(modelo, armazenamento)
);

create index if not exists idx_tradein_garantia_modelo on tradein_garantia(modelo);

grant all on table tradein_garantia to service_role;
grant all on table tradein_garantia to postgres;
grant all on table tradein_garantia to authenticated;
alter table tradein_garantia disable row level security;

-- Horários de entrega/retirada configuráveis (link de compra)
create table if not exists horarios_config (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, -- 'entrega' | 'retirada'
  dia_semana text not null, -- 'seg_sex' | 'sabado'
  horario text not null, -- '10:00', '11:00', etc
  ativo boolean not null default true,
  unique(tipo, dia_semana, horario)
);

-- Seed com horários padrão
-- Entrega: Seg-Sex 10-19, Sab 10-17
insert into horarios_config (tipo, dia_semana, horario) values
  ('entrega', 'seg_sex', '10:00'), ('entrega', 'seg_sex', '11:00'), ('entrega', 'seg_sex', '12:00'),
  ('entrega', 'seg_sex', '13:00'), ('entrega', 'seg_sex', '14:00'), ('entrega', 'seg_sex', '15:00'),
  ('entrega', 'seg_sex', '16:00'), ('entrega', 'seg_sex', '17:00'), ('entrega', 'seg_sex', '18:00'),
  ('entrega', 'seg_sex', '19:00'),
  ('entrega', 'sabado', '10:00'), ('entrega', 'sabado', '11:00'), ('entrega', 'sabado', '12:00'),
  ('entrega', 'sabado', '13:00'), ('entrega', 'sabado', '14:00'), ('entrega', 'sabado', '15:00'),
  ('entrega', 'sabado', '16:00'), ('entrega', 'sabado', '17:00'),
  -- Retirada: Seg-Sex 11-18, Sab 11-16
  ('retirada', 'seg_sex', '11:00'), ('retirada', 'seg_sex', '12:00'), ('retirada', 'seg_sex', '13:00'),
  ('retirada', 'seg_sex', '14:00'), ('retirada', 'seg_sex', '15:00'), ('retirada', 'seg_sex', '16:00'),
  ('retirada', 'seg_sex', '17:00'), ('retirada', 'seg_sex', '18:00'),
  ('retirada', 'sabado', '11:00'), ('retirada', 'sabado', '12:00'), ('retirada', 'sabado', '13:00'),
  ('retirada', 'sabado', '14:00'), ('retirada', 'sabado', '15:00'), ('retirada', 'sabado', '16:00')
on conflict do nothing;

grant all on table horarios_config to service_role;
grant all on table horarios_config to postgres;
grant all on table horarios_config to authenticated;
alter table horarios_config disable row level security;
