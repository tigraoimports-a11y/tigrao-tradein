-- Crédito de lojistas (saldo pré-pago usável como forma de pagamento em vendas ATACADO)

create table if not exists lojistas_credito (
  id uuid primary key default gen_random_uuid(),
  cliente_key text not null unique, -- cpf/cnpj normalizado (só dígitos) ou nome em UPPER
  nome text not null,
  cpf text,
  cnpj text,
  saldo numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lojistas_credito_cpf on lojistas_credito(cpf);
create index if not exists idx_lojistas_credito_cnpj on lojistas_credito(cnpj);

create table if not exists lojistas_credito_log (
  id uuid primary key default gen_random_uuid(),
  lojista_id uuid not null references lojistas_credito(id) on delete cascade,
  venda_id uuid,
  tipo text not null check (tipo in ('CREDITO','DEBITO','AJUSTE')),
  valor numeric not null,
  saldo_antes numeric not null,
  saldo_depois numeric not null,
  motivo text,
  usuario text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lojistas_credito_log_lojista on lojistas_credito_log(lojista_id, created_at desc);
create index if not exists idx_lojistas_credito_log_venda on lojistas_credito_log(venda_id);
