-- Histórico de orçamentos gerados em /admin/orcamento.
-- Cada vez que o vendedor clica em "Copiar" ou "Enviar WhatsApp",
-- o orçamento é persistido aqui pra:
--   1. Saber quais foram gerados, por quem, pra quem (se preencheu cliente)
--   2. Tracking: virou venda? (manual ou via match automático)
--   3. Reabrir um orçamento antigo no formulário
--
-- Tracking de conversão é via vinculação manual (botão "Virou venda" no admin)
-- ou via match automático (mesmo telefone do cliente + valor próximo numa venda
-- recente — implementação iterativa, MVP é manual).

CREATE TABLE IF NOT EXISTS orcamentos_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Quem gerou (do x-admin-user header)
  vendedor TEXT,

  -- Tipo de orçamento (lacrado ou seminovo)
  tipo TEXT NOT NULL DEFAULT 'lacrado' CHECK (tipo IN ('lacrado', 'seminovo')),

  -- Cliente (opcional, vendedor pode ou não preencher)
  cliente_nome TEXT,
  cliente_telefone TEXT,

  -- Snapshot dos itens do orçamento
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  trocas JSONB DEFAULT '[]'::jsonb,
  desconto NUMERIC DEFAULT 0,
  entrada NUMERIC DEFAULT 0,
  parcelas_selecionadas JSONB DEFAULT '[]'::jsonb,
  valor_total NUMERIC DEFAULT 0,

  -- Texto pronto que foi gerado
  texto_gerado TEXT,

  -- Tracking de conversão
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'VIROU_VENDA', 'PERDIDO', 'ARQUIVADO')),
  venda_id UUID REFERENCES vendas(id) ON DELETE SET NULL,
  marcado_em TIMESTAMPTZ,
  marcado_por TEXT,

  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_historico_created
  ON orcamentos_historico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_historico_vendedor
  ON orcamentos_historico(vendedor, created_at DESC) WHERE vendedor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orcamentos_historico_status
  ON orcamentos_historico(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_historico_telefone
  ON orcamentos_historico(cliente_telefone) WHERE cliente_telefone IS NOT NULL;
