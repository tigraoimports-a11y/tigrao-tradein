-- ===========================================
-- FASE 1 — TigrãoImports: Tabelas Supabase
-- Rodar no SQL Editor do Supabase
-- ===========================================

-- 1. VENDAS
CREATE TABLE IF NOT EXISTS vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  data DATE NOT NULL,
  cliente TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('ANUNCIO','RECOMPRA','INDICACAO','ATACADO')),
  tipo TEXT NOT NULL CHECK (tipo IN ('VENDA','UPGRADE','ATACADO')),
  produto TEXT NOT NULL,
  fornecedor TEXT,
  custo NUMERIC NOT NULL DEFAULT 0,
  preco_vendido NUMERIC NOT NULL DEFAULT 0,
  banco TEXT NOT NULL CHECK (banco IN ('ITAU','INFINITE','MERCADO_PAGO','ESPECIE')),
  forma TEXT NOT NULL CHECK (forma IN ('PIX','CARTAO','DINHEIRO','FIADO')),
  recebimento TEXT NOT NULL CHECK (recebimento IN ('D+0','D+1','FIADO','PARCELADO')),
  lucro NUMERIC GENERATED ALWAYS AS (preco_vendido - custo) STORED,
  margem_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN preco_vendido > 0 THEN ROUND(((preco_vendido - custo) / preco_vendido) * 100, 1) ELSE 0 END
  ) STORED,
  sinal_antecipado NUMERIC DEFAULT 0,
  banco_sinal TEXT,
  local TEXT,
  produto_na_troca TEXT,
  entrada_pix NUMERIC DEFAULT 0,
  banco_pix TEXT,
  banco_2nd TEXT,
  qnt_parcelas INTEGER,
  bandeira TEXT CHECK (bandeira IN ('VISA','MASTERCARD','ELO','AMEX') OR bandeira IS NULL),
  valor_comprovante NUMERIC,
  banco_alt TEXT,
  parc_alt INTEGER,
  band_alt TEXT,
  comp_alt NUMERIC
);

CREATE INDEX idx_vendas_data ON vendas(data);
CREATE INDEX idx_vendas_recebimento ON vendas(recebimento);
CREATE INDEX idx_vendas_banco ON vendas(banco);

-- 2. REAJUSTES
CREATE TABLE IF NOT EXISTS reajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  data DATE NOT NULL,
  cliente TEXT NOT NULL,
  motivo TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  banco TEXT,
  venda_ref UUID REFERENCES vendas(id) ON DELETE SET NULL
);

CREATE INDEX idx_reajustes_data ON reajustes(data);

-- 3. GASTOS
CREATE TABLE IF NOT EXISTS gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('SAIDA','ENTRADA')),
  hora TIME,
  categoria TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL,
  banco TEXT CHECK (banco IN ('ITAU','INFINITE','MERCADO_PAGO','ESPECIE') OR banco IS NULL),
  observacao TEXT,
  is_dep_esp BOOLEAN DEFAULT false,
  grupo_id UUID
);

CREATE INDEX idx_gastos_data ON gastos(data);
CREATE INDEX idx_gastos_tipo ON gastos(tipo);
CREATE INDEX idx_gastos_grupo ON gastos(grupo_id);

-- 4. SALDOS BANCÁRIOS
CREATE TABLE IF NOT EXISTS saldos_bancarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  data DATE NOT NULL UNIQUE,
  itau_base NUMERIC DEFAULT 0,
  inf_base NUMERIC DEFAULT 0,
  mp_base NUMERIC DEFAULT 0,
  esp_itau NUMERIC DEFAULT 0,
  esp_inf NUMERIC DEFAULT 0,
  esp_mp NUMERIC DEFAULT 0,
  esp_especie NUMERIC DEFAULT 0
);

CREATE INDEX idx_saldos_data ON saldos_bancarios(data);

-- Verificação
SELECT 'Tabelas criadas com sucesso!' AS resultado;
