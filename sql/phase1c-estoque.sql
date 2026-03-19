-- ===========================================
-- Tabela de Estoque — TigrãoImports
-- Rodar no SQL Editor do Supabase
-- ===========================================

CREATE TABLE IF NOT EXISTS estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  produto TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('IPHONES','IPADS','MACBOOK','APPLE_WATCH','AIRPODS','ACESSORIOS','OUTROS')),
  qnt INTEGER NOT NULL DEFAULT 0,
  custo_unitario NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'EM ESTOQUE' CHECK (status IN ('EM ESTOQUE','A CAMINHO','PENDENTE','ESGOTADO')),
  fornecedor TEXT,
  cor TEXT,
  observacao TEXT,
  UNIQUE(produto, cor)
);

CREATE INDEX IF NOT EXISTS idx_estoque_categoria ON estoque(categoria);
CREATE INDEX IF NOT EXISTS idx_estoque_status ON estoque(status);
CREATE INDEX IF NOT EXISTS idx_estoque_qnt ON estoque(qnt);

GRANT ALL ON TABLE estoque TO service_role, anon, authenticated;

SELECT 'Tabela estoque criada com sucesso!' AS resultado;
