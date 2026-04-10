-- Tabela de Termos de Declaração de Propriedade e Procedência
-- Vincula aparelhos usados recebidos na troca ao cliente e operação

CREATE TABLE IF NOT EXISTS termos_procedencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos (opcionais — pelo menos um deve existir)
  venda_id UUID,
  encomenda_id UUID,
  pendencia_id UUID,

  -- Cliente
  cliente_nome TEXT NOT NULL,
  cliente_cpf TEXT NOT NULL,

  -- Aparelhos (JSONB array para suportar N aparelhos)
  -- Formato: [{"modelo":"iPhone 15 Pro","capacidade":"256GB","cor":"Preto","imei":"353...","serial":"F2L...","condicao":"Bateria 87%, Grade A"}]
  aparelhos JSONB NOT NULL DEFAULT '[]',

  -- Controle
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','GERADO','ENVIADO','ASSINADO')),
  cidade TEXT DEFAULT 'Rio de Janeiro',
  data_termo DATE DEFAULT CURRENT_DATE,
  gerado_por TEXT,
  pdf_url TEXT,
  observacao TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_termos_venda ON termos_procedencia(venda_id) WHERE venda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_termos_encomenda ON termos_procedencia(encomenda_id) WHERE encomenda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_termos_pendencia ON termos_procedencia(pendencia_id) WHERE pendencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_termos_cliente ON termos_procedencia(cliente_nome);
CREATE INDEX IF NOT EXISTS idx_termos_status ON termos_procedencia(status);

-- Grants (mesmo padrão das outras tabelas)
GRANT ALL ON termos_procedencia TO authenticated;
GRANT ALL ON termos_procedencia TO service_role;
