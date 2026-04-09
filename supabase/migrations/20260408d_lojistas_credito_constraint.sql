-- Garante que a UNIQUE constraint em cliente_key existe (pode ter sido criada sem ela).
-- Tambem cria uma function SQL que faz o upsert atomico — elimina qualquer possibilidade
-- de afetar multiplas linhas via JS/HTTP.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lojistas_credito_cliente_key_key'
      and conrelid = 'lojistas_credito'::regclass
  ) then
    -- remove duplicadas antes de criar o constraint (se houver)
    delete from lojistas_credito a
    using lojistas_credito b
    where a.id < b.id and a.cliente_key = b.cliente_key;
    alter table lojistas_credito add constraint lojistas_credito_cliente_key_key unique (cliente_key);
  end if;
end $$;

-- Function atomica que faz a movimentacao de credito pelo cliente_key
create or replace function mover_credito_lojista(
  p_cliente_key text,
  p_nome text,
  p_cpf text,
  p_cnpj text,
  p_tipo text,
  p_valor numeric,
  p_venda_id uuid,
  p_motivo text,
  p_usuario text
) returns jsonb
language plpgsql
as $$
declare
  v_id uuid;
  v_saldo_antes numeric := 0;
  v_saldo_depois numeric := 0;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'valor deve ser > 0';
  end if;
  if p_tipo not in ('CREDITO', 'DEBITO', 'AJUSTE') then
    raise exception 'tipo invalido: %', p_tipo;
  end if;

  -- Lock + leitura
  select id, coalesce(saldo, 0) into v_id, v_saldo_antes
  from lojistas_credito
  where cliente_key = p_cliente_key
  for update;

  if v_id is null then
    -- Insert novo
    insert into lojistas_credito (cliente_key, nome, cpf, cnpj, saldo, updated_at)
    values (p_cliente_key, p_nome, p_cpf, p_cnpj, 0, now())
    returning id into v_id;
    v_saldo_antes := 0;
  end if;

  if p_tipo = 'CREDITO' then
    v_saldo_depois := v_saldo_antes + p_valor;
  elsif p_tipo = 'DEBITO' then
    v_saldo_depois := v_saldo_antes - p_valor;
    if v_saldo_depois < 0 then
      raise exception 'Saldo insuficiente. Disponivel: %, tentativa: %', v_saldo_antes, p_valor;
    end if;
  else -- AJUSTE
    v_saldo_depois := p_valor;
  end if;

  update lojistas_credito
  set saldo = v_saldo_depois,
      nome = p_nome,
      updated_at = now()
  where id = v_id;

  insert into lojistas_credito_log (lojista_id, venda_id, tipo, valor, saldo_antes, saldo_depois, motivo, usuario)
  values (v_id, p_venda_id, p_tipo, p_valor, v_saldo_antes, v_saldo_depois, p_motivo, p_usuario);

  return jsonb_build_object(
    'lojista_id', v_id,
    'saldo_antes', v_saldo_antes,
    'saldo_depois', v_saldo_depois,
    'cliente_key', p_cliente_key
  );
end;
$$;

grant execute on function mover_credito_lojista(text, text, text, text, text, numeric, uuid, text, text)
  to service_role, authenticated, anon;
