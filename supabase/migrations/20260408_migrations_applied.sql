-- Controle de migrations aplicadas.
-- Cada arquivo .sql em supabase/migrations/ é listado na página /admin/migrations.
-- Ao rodar, o nome do arquivo é inserido aqui pra nunca mais rodar de novo.

create table if not exists _migrations_applied (
  nome text primary key,
  aplicada_em timestamptz not null default now(),
  aplicada_por text,
  checksum text,
  sucesso boolean default true,
  erro text
);

-- Helper: exec SQL dinâmico (necessário pra rodar migrations via API).
-- Só o service role pode chamar, e a página /admin/migrations usa x-admin-password.
create or replace function exec_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql;
end;
$$;

revoke all on function exec_sql(text) from public;
revoke all on function exec_sql(text) from anon;
revoke all on function exec_sql(text) from authenticated;
-- service_role keeps access (owner).

-- Semeia as migrations antigas como já aplicadas (baseline até 07/04).
-- Só marca, não roda de novo.
insert into _migrations_applied (nome, aplicada_por, aplicada_em) values
  ('20260403_garantia.sql', 'baseline', now()),
  ('20260403_tipo_atacado.sql', 'baseline', now()),
  ('20260403_unique_serial_ativo.sql', 'baseline', now()),
  ('20260404_cor_pt.sql', 'baseline', now()),
  ('20260404_scan_sessions.sql', 'baseline', now()),
  ('20260404_trocas.sql', 'baseline', now()),
  ('20260406_app_settings.sql', 'baseline', now()),
  ('20260406_app_settings_grants.sql', 'baseline', now()),
  ('20260406_cleanup_acessorios_serial.sql', 'baseline', now()),
  ('20260406_fix_duplicate_serial.sql', 'baseline', now()),
  ('20260406_rename_grade_aplus.sql', 'baseline', now()),
  ('20260406_vendas_troca_serial_imei.sql', 'baseline', now()),
  ('20260407_entregas_flags_bia.sql', 'baseline', now()),
  ('20260407_estoque_troca_id.sql', 'baseline', now()),
  ('20260407_gastos_estorno.sql', 'baseline', now()),
  ('20260407_link_compras.sql', 'baseline', now()),
  ('20260407_link_compras_entrega.sql', 'baseline', now()),
  ('20260407_simulacoes_cor_usado.sql', 'baseline', now()),
  ('20260407_trocas_grants.sql', 'baseline', now()),
  ('20260407_vendas_frete_atacado.sql', 'baseline', now())
on conflict (nome) do nothing;
