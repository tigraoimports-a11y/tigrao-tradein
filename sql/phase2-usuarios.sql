-- Sistema de Usuários e Audit Log — TigrãoImports
-- Rodar no SQL Editor do Supabase

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'estoque' CHECK (role IN ('admin','estoque')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir usuários iniciais
INSERT INTO usuarios (nome, login, senha, role) VALUES
  ('André', 'andre', 'tigrao2026', 'admin'),
  ('Nicolas', 'nicolas', 'nicolas2026', 'admin'),
  ('Bianca', 'bianca', 'bianca2026', 'estoque'),
  ('Laynne', 'laynne', 'laynne2026', 'estoque')
ON CONFLICT (login) DO NOTHING;

-- Audit log para estoque
CREATE TABLE IF NOT EXISTS estoque_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  usuario TEXT NOT NULL,
  acao TEXT NOT NULL,
  produto_id UUID,
  produto_nome TEXT,
  campo TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  detalhes TEXT
);

CREATE INDEX IF NOT EXISTS idx_estoque_log_created ON estoque_log(created_at);
CREATE INDEX IF NOT EXISTS idx_estoque_log_usuario ON estoque_log(usuario);

GRANT ALL ON TABLE usuarios TO service_role, anon, authenticated;
GRANT ALL ON TABLE estoque_log TO service_role, anon, authenticated;

SELECT 'Usuarios e audit log criados!' AS resultado;
