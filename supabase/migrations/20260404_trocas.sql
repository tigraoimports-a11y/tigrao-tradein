-- Tabela de trocas de produtos
CREATE TABLE IF NOT EXISTS trocas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo TEXT NOT NULL,
  fornecedor TEXT,
  observacao TEXT,
  -- Produto que saiu
  produto_saida_nome TEXT NOT NULL,
  produto_saida_categoria TEXT,
  produto_saida_cor TEXT,
  produto_saida_serial TEXT,
  produto_saida_imei TEXT,
  produto_saida_custo NUMERIC(10,2) DEFAULT 0,
  -- Produto que entrou
  produto_entrada_nome TEXT NOT NULL,
  produto_entrada_categoria TEXT,
  produto_entrada_cor TEXT,
  produto_entrada_serial TEXT,
  produto_entrada_imei TEXT,
  produto_entrada_custo NUMERIC(10,2) DEFAULT 0,
  -- Financeiro
  diferenca_valor NUMERIC(10,2) DEFAULT 0,
  banco TEXT,
  -- Refs
  produto_entrada_estoque_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE trocas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trocas_all" ON trocas FOR ALL USING (true) WITH CHECK (true);
