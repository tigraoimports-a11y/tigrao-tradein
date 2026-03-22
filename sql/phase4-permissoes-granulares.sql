-- Permissoes granulares por usuario — TigrãoImports
-- Rodar no SQL Editor do Supabase

-- Adicionar coluna permissoes (JSONB com array de page keys)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes jsonb DEFAULT '[]'::jsonb;

-- Atualizar check constraint para aceitar novos roles
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check CHECK (role IN ('admin', 'equipe'));

-- Migrar roles antigos para 'equipe'
UPDATE usuarios SET role = 'equipe' WHERE role NOT IN ('admin', 'equipe');

SELECT 'Permissoes granulares configuradas!' AS resultado;
