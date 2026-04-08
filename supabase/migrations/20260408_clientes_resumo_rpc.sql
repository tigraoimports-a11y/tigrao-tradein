-- RPC que retorna clientes/lojistas já agrupados via SQL (elimina scan + group em JS).
-- Usa chave cpf (se houver) ou nome uppercase como identificador.

create or replace function clientes_resumo(
  p_is_lojista boolean,
  p_search text default null
) returns table (
  nome text,
  cpf text,
  cnpj text,
  email text,
  bairro text,
  cidade text,
  uf text,
  total_compras bigint,
  total_gasto numeric,
  ultima_compra date,
  ultimo_produto text,
  cliente_desde date,
  is_lojista boolean
)
language sql
stable
as $$
  with filtered as (
    select *
    from vendas
    where coalesce(status_pagamento, '') <> 'CANCELADO'
      and coalesce(cliente, '') <> ''
      and (
        p_search is null or p_search = '' or
        cliente ilike '%' || p_search || '%' or
        cpf ilike '%' || regexp_replace(p_search, '[\.\-\/\s]', '', 'g') || '%' or
        serial_no ilike '%' || regexp_replace(p_search, '[\.\-\/\s]', '', 'g') || '%' or
        imei ilike '%' || regexp_replace(p_search, '[\.\-\/\s]', '', 'g') || '%'
      )
  ),
  keyed as (
    select
      case
        when coalesce(cpf, '') <> '' then 'cpf:' || cpf
        when coalesce(cnpj, '') <> '' then 'cnpj:' || cnpj
        else 'nome:' || regexp_replace(upper(trim(cliente)), '\s+(ATACADO|ATAC|LOJAS?|STORE|IMPORTS?|CELL|CEL)\b.*$', '', 'i')
      end as cliente_key,
      *,
      (tipo = 'ATACADO' or origem = 'ATACADO') as v_is_lojista
    from filtered
  ),
  grouped as (
    select
      cliente_key,
      (array_agg(cliente order by length(cliente) desc))[1] as nome,
      (array_agg(cpf) filter (where cpf is not null))[1] as cpf,
      (array_agg(cnpj) filter (where cnpj is not null))[1] as cnpj,
      (array_agg(email) filter (where email is not null))[1] as email,
      (array_agg(bairro) filter (where bairro is not null))[1] as bairro,
      (array_agg(cidade) filter (where cidade is not null))[1] as cidade,
      (array_agg(uf) filter (where uf is not null))[1] as uf,
      count(*) as total_compras,
      sum(coalesce(preco_vendido, 0)) as total_gasto,
      max(data) as ultima_compra,
      (array_agg(produto order by data desc))[1] as ultimo_produto,
      min(data) as cliente_desde,
      bool_or(v_is_lojista) as is_lojista
    from keyed
    group by cliente_key
  )
  select
    nome, cpf, cnpj, email, bairro, cidade, uf,
    total_compras, total_gasto, ultima_compra, ultimo_produto, cliente_desde, is_lojista
  from grouped
  where is_lojista = p_is_lojista
  order by total_gasto desc;
$$;

grant execute on function clientes_resumo(boolean, text) to service_role, authenticated, anon;
