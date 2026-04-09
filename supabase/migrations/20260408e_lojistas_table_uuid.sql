-- Tabela persistente de lojistas com UUID auto — resolve o problema de
-- identificacao ambígua por nome. Cada lojista é um cadastro único com id
-- próprio, desvinculado do texto do nome em vendas.

create table if not exists lojistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  cnpj text,
  saldo_credito numeric not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lojistas_nome on lojistas(upper(nome));
create index if not exists idx_lojistas_cnpj on lojistas(cnpj);
create index if not exists idx_lojistas_cpf on lojistas(cpf);

-- Log de movimentacoes (mesmo padrao do lojistas_credito_log mas referencia lojistas)
create table if not exists lojistas_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  lojista_id uuid not null references lojistas(id) on delete cascade,
  venda_id uuid,
  tipo text not null check (tipo in ('CREDITO','DEBITO','AJUSTE')),
  valor numeric not null,
  saldo_antes numeric not null,
  saldo_depois numeric not null,
  motivo text,
  usuario text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lojistas_mov_lojista on lojistas_movimentacoes(lojista_id, created_at desc);

grant all on lojistas to service_role, authenticated, anon;
grant all on lojistas_movimentacoes to service_role, authenticated, anon;
alter table lojistas enable row level security;
alter table lojistas_movimentacoes enable row level security;
drop policy if exists "service_role_all" on lojistas;
drop policy if exists "service_role_all" on lojistas_movimentacoes;
create policy "service_role_all" on lojistas for all to service_role using (true) with check (true);
create policy "service_role_all" on lojistas_movimentacoes for all to service_role using (true) with check (true);

-- Function atomica pra movimentar saldo por UUID — elimina qualquer chance
-- de afetar linhas erradas (SELECT FOR UPDATE + WHERE id = uuid).
create or replace function mover_saldo_lojista(
  p_lojista_id uuid,
  p_tipo text,
  p_valor numeric,
  p_venda_id uuid,
  p_motivo text,
  p_usuario text
) returns jsonb
language plpgsql
as $$
declare
  v_saldo_antes numeric := 0;
  v_saldo_depois numeric := 0;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'valor deve ser > 0';
  end if;
  if p_tipo not in ('CREDITO', 'DEBITO', 'AJUSTE') then
    raise exception 'tipo invalido: %', p_tipo;
  end if;

  select coalesce(saldo_credito, 0) into v_saldo_antes
  from lojistas
  where id = p_lojista_id
  for update;

  if not found then
    raise exception 'lojista nao encontrado: %', p_lojista_id;
  end if;

  if p_tipo = 'CREDITO' then
    v_saldo_depois := v_saldo_antes + p_valor;
  elsif p_tipo = 'DEBITO' then
    v_saldo_depois := v_saldo_antes - p_valor;
    if v_saldo_depois < 0 then
      raise exception 'Saldo insuficiente. Disponivel: %, tentativa: %', v_saldo_antes, p_valor;
    end if;
  else
    v_saldo_depois := p_valor;
  end if;

  update lojistas
  set saldo_credito = v_saldo_depois, updated_at = now()
  where id = p_lojista_id;

  insert into lojistas_movimentacoes (lojista_id, venda_id, tipo, valor, saldo_antes, saldo_depois, motivo, usuario)
  values (p_lojista_id, p_venda_id, p_tipo, p_valor, v_saldo_antes, v_saldo_depois, p_motivo, p_usuario);

  return jsonb_build_object(
    'lojista_id', p_lojista_id,
    'saldo_antes', v_saldo_antes,
    'saldo_depois', v_saldo_depois
  );
end;
$$;

grant execute on function mover_saldo_lojista(uuid, text, numeric, uuid, text, text)
  to service_role, authenticated, anon;
