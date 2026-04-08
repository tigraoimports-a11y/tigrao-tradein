-- Histórico persistente de links de compra gerados em /admin/gerar-link
-- Cada registro guarda os dados do cliente/produto/pagamento/troca + short_code
-- para busca posterior, reutilização e análise de conversão.
CREATE TABLE IF NOT EXISTS link_compras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_code TEXT NOT NULL,
  url_curta TEXT,
  tipo TEXT NOT NULL DEFAULT 'COMPRA', -- 'COMPRA' | 'TROCA'
  -- Cliente
  cliente_nome TEXT,
  cliente_telefone TEXT,
  cliente_cpf TEXT,
  cliente_email TEXT,
  -- Produto
  produto TEXT NOT NULL,
  produtos_extras TEXT, -- JSON array de produtos adicionais
  cor TEXT,
  valor NUMERIC(10,2) DEFAULT 0,
  -- Pagamento
  forma_pagamento TEXT,
  parcelas TEXT,
  entrada NUMERIC(10,2) DEFAULT 0,
  -- Troca (quando tipo = TROCA)
  troca_produto TEXT,
  troca_valor NUMERIC(10,2) DEFAULT 0,
  troca_produto2 TEXT,
  troca_valor2 NUMERIC(10,2) DEFAULT 0,
  -- Meta
  vendedor TEXT,
  simulacao_id UUID, -- ref opcional quando veio de uma simulação salva
  status TEXT NOT NULL DEFAULT 'ATIVO', -- 'ATIVO' | 'CONVERTIDO' | 'ARQUIVADO'
  arquivado BOOLEAN NOT NULL DEFAULT FALSE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_link_compras_created_at ON link_compras(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_compras_cliente_telefone ON link_compras(cliente_telefone);
CREATE INDEX IF NOT EXISTS idx_link_compras_cliente_cpf ON link_compras(cliente_cpf);
CREATE INDEX IF NOT EXISTS idx_link_compras_short_code ON link_compras(short_code);
CREATE INDEX IF NOT EXISTS idx_link_compras_tipo ON link_compras(tipo);
CREATE INDEX IF NOT EXISTS idx_link_compras_arquivado ON link_compras(arquivado) WHERE arquivado = FALSE;

-- RLS: libera acesso (API valida via x-admin-password antes)
ALTER TABLE link_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS link_compras_all ON link_compras;
CREATE POLICY link_compras_all ON link_compras FOR ALL USING (true) WITH CHECK (true);

-- Garantir privilégios para service_role, authenticated e anon
-- (sem isso, mesmo com RLS liberada, o INSERT falha com "permission denied for table")
GRANT ALL ON link_compras TO service_role;
GRANT ALL ON link_compras TO authenticated;
GRANT ALL ON link_compras TO anon;
