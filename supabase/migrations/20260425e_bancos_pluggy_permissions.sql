-- Fix: permissoes nas tabelas bancos_conexoes / bancos_saldos_historico
--
-- Bug em producao depois da 20260425d_bancos_pluggy.sql:
-- "permission denied for table bancos_conexoes"
--
-- Causa: a migration original criou as tabelas mas nao deu GRANT nem
-- desabilitou RLS. As outras tabelas do projeto (instagram_posts,
-- link_compras, etc) tem esses comandos. Padrao do projeto.
--
-- Idempotente — pode rodar varias vezes sem efeito.

-- Tabela 1: bancos_conexoes
GRANT ALL ON TABLE bancos_conexoes TO service_role;
GRANT ALL ON TABLE bancos_conexoes TO postgres;
GRANT ALL ON TABLE bancos_conexoes TO authenticated;
ALTER TABLE bancos_conexoes DISABLE ROW LEVEL SECURITY;

-- Sequence do BIGSERIAL precisa de GRANT separado pra inserts funcionarem
GRANT USAGE, SELECT ON SEQUENCE bancos_conexoes_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE bancos_conexoes_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE bancos_conexoes_id_seq TO postgres;

-- Tabela 2: bancos_saldos_historico
GRANT ALL ON TABLE bancos_saldos_historico TO service_role;
GRANT ALL ON TABLE bancos_saldos_historico TO postgres;
GRANT ALL ON TABLE bancos_saldos_historico TO authenticated;
ALTER TABLE bancos_saldos_historico DISABLE ROW LEVEL SECURITY;

GRANT USAGE, SELECT ON SEQUENCE bancos_saldos_historico_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE bancos_saldos_historico_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE bancos_saldos_historico_id_seq TO postgres;
