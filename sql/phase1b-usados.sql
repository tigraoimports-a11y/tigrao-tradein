-- ===========================================
-- Tabela de avaliação de usados — TigrãoImports
-- Rodar no SQL Editor do Supabase
-- ===========================================

-- Valores base de avaliação dos usados
CREATE TABLE IF NOT EXISTS avaliacao_usados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo TEXT NOT NULL,
  armazenamento TEXT NOT NULL,
  valor_base NUMERIC NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(modelo, armazenamento)
);

CREATE INDEX idx_avaliacao_usados_modelo ON avaliacao_usados(modelo);

-- Descontos por condição
CREATE TABLE IF NOT EXISTS descontos_condicao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condicao TEXT NOT NULL,
  detalhe TEXT NOT NULL,
  desconto NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(condicao, detalhe)
);

-- Modelos excluídos do trade-in
CREATE TABLE IF NOT EXISTS modelos_excluidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

SELECT 'Tabelas de avaliação criadas com sucesso!' AS resultado;
