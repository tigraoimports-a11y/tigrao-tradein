-- Garantir que a tabela app_settings existe e tem permissões corretas
-- (estava bloqueando save de overrides de títulos de cards no estoque)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON app_settings TO postgres, service_role, authenticated, anon;

-- RLS desabilitado (acesso controlado via API com x-admin-password)
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
