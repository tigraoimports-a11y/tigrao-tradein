-- Tabelas de cotação de fornecedores
CREATE TABLE IF NOT EXISTS cotacao_listas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  nome TEXT NOT NULL DEFAULT 'Lista do dia',
  status TEXT DEFAULT 'ABERTA' CHECK (status IN ('ABERTA','FECHADA')),
  data DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS cotacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id UUID NOT NULL REFERENCES cotacao_listas(id) ON DELETE CASCADE,
  produto TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cotacao_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES cotacao_itens(id) ON DELETE CASCADE,
  fornecedor TEXT NOT NULL,
  preco NUMERIC NOT NULL,
  prazo TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON TABLE cotacao_listas TO service_role, anon, authenticated;
GRANT ALL ON TABLE cotacao_itens TO service_role, anon, authenticated;
GRANT ALL ON TABLE cotacao_precos TO service_role, anon, authenticated;
SELECT 'Tabelas cotacao criadas!' AS resultado;
