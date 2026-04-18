-- Tabela de funcionarios da Tigrao (dono, funcionarios, entregadores).
-- Tag 'TIGRAO' pra distinguir de outros eventuais funcionarios externos no futuro.

CREATE TABLE IF NOT EXISTS funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL CHECK (cargo IN ('DONO', 'FUNCIONARIO', 'ENTREGADOR')),
  tag TEXT NOT NULL DEFAULT 'TIGRAO',
  telefone TEXT,
  email TEXT,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_admissao DATE,
  data_desligamento DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_tag ON funcionarios(tag);
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo ON funcionarios(ativo);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cargo ON funcionarios(cargo);

-- Privilegios (acesso controlado via API com x-admin-password)
GRANT ALL ON funcionarios TO anon, authenticated, service_role;
ALTER TABLE funcionarios DISABLE ROW LEVEL SECURITY;

-- Seed dos 7 funcionarios da Tigrao
INSERT INTO funcionarios (nome, cargo, tag) VALUES
  ('André',    'DONO',        'TIGRAO'),
  ('Nicolas',  'FUNCIONARIO', 'TIGRAO'),
  ('Laynne',   'FUNCIONARIO', 'TIGRAO'),
  ('Bianca',   'FUNCIONARIO', 'TIGRAO'),
  ('Paloma',   'FUNCIONARIO', 'TIGRAO'),
  ('Leandro',  'ENTREGADOR',  'TIGRAO'),
  ('Igor',     'ENTREGADOR',  'TIGRAO')
ON CONFLICT DO NOTHING;

-- Coluna opcional em gastos pra vincular a um funcionario (ex: salario, adiantamento).
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES funcionarios(id);
CREATE INDEX IF NOT EXISTS idx_gastos_funcionario ON gastos(funcionario_id);
