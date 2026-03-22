-- ============================================
-- Phase 3: Activity Log + Role-based Permissions
-- Rodar no SQL Editor do Supabase
-- ============================================

-- 1. Tabela de log de atividades
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario text NOT NULL,
  acao text NOT NULL,
  detalhes text,
  entidade text,
  entidade_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_usuario ON activity_log(usuario);

GRANT ALL ON activity_log TO anon, authenticated, service_role;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;

-- 2. Atualizar CHECK constraint da tabela usuarios para aceitar novos roles
-- Remover a constraint antiga e adicionar a nova
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin', 'estoque', 'vendedor', 'visualizador'));

-- 3. Verificar que tudo foi criado
SELECT 'Activity log e permissions configurados!' AS resultado;
