-- Fix: tabela rastreios_envio estava sem GRANT e RLS ativo,
-- resultando em "permission denied for table rastreios_envio" ao tentar
-- inserir codigos via /api/admin/rastreios-envio.
-- Acesso e controlado via x-admin-password na camada de API.

GRANT ALL ON rastreios_envio TO postgres, service_role, authenticated, anon;

ALTER TABLE rastreios_envio DISABLE ROW LEVEL SECURITY;
