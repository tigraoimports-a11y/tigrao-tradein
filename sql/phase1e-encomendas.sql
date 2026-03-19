-- Tabela de Encomendas — TigrãoImports
CREATE TABLE IF NOT EXISTS encomendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  cliente TEXT NOT NULL,
  whatsapp TEXT,
  data DATE NOT NULL,
  produto TEXT NOT NULL,
  cor TEXT,
  valor_venda NUMERIC NOT NULL DEFAULT 0,
  sinal_recebido NUMERIC DEFAULT 0,
  banco_sinal TEXT,
  custo NUMERIC DEFAULT 0,
  fornecedor TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','COMPRADO','A CAMINHO','ENTREGUE','CANCELADA')),
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_encomendas_status ON encomendas(status);
CREATE INDEX IF NOT EXISTS idx_encomendas_data ON encomendas(data);
GRANT ALL ON TABLE encomendas TO service_role, anon, authenticated;
SELECT 'Tabela encomendas criada!' AS resultado;
