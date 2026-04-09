-- Tabela para anotações de clientes aguardando produto
create table if not exists avisos_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text,
  instagram text,
  produto_desejado text not null,
  observacao text,
  status text not null default 'AGUARDANDO', -- AGUARDANDO | NOTIFICADO | CANCELADO
  notificado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_avisos_clientes_status on avisos_clientes(status);
create index if not exists idx_avisos_clientes_created on avisos_clientes(created_at desc);

-- Grants: backend usa service_role (bypass RLS), mas garante permissões explícitas
grant all on table avisos_clientes to service_role;
grant all on table avisos_clientes to postgres;
grant all on table avisos_clientes to authenticated;
alter table avisos_clientes disable row level security;
