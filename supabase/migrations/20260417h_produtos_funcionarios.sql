-- Feature: Produtos com Funcionarios
-- Tabela principal + pagamentos + novo status em estoque pra itens vinculados.

-- 1) Tabela principal
CREATE TABLE IF NOT EXISTS produtos_funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id UUID REFERENCES estoque(id) ON DELETE SET NULL,
  funcionario TEXT NOT NULL,
  -- snapshot do produto (caso o item do estoque seja editado/deletado depois)
  produto TEXT NOT NULL,
  categoria TEXT,
  cor TEXT,
  serial_no TEXT,
  imei TEXT,
  -- acordo
  tipo_acordo TEXT NOT NULL CHECK (tipo_acordo IN ('CEDIDO','PARCIAL','TOTAL','SUBSIDIADO','OUTRO')),
  percentual_funcionario INT CHECK (percentual_funcionario >= 0 AND percentual_funcionario <= 100),
  valor_total NUMERIC(10,2),
  valor_empresa NUMERIC(10,2),
  valor_funcionario NUMERIC(10,2),
  valor_pago NUMERIC(10,2) DEFAULT 0,
  observacao TEXT NOT NULL,
  -- status
  status TEXT NOT NULL DEFAULT 'EM_USO' CHECK (status IN (
    'EM_USO','CEDIDO','ACORDO_ATIVO','PENDENTE_PAGAMENTO',
    'QUITADO','DEVOLVIDO','DESLIGADO_PENDENTE'
  )),
  data_saida DATE NOT NULL DEFAULT CURRENT_DATE,
  data_devolucao DATE,
  criado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prodfunc_funcionario ON produtos_funcionarios(funcionario);
CREATE INDEX IF NOT EXISTS idx_prodfunc_status ON produtos_funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_prodfunc_estoque ON produtos_funcionarios(estoque_id);

-- 2) Pagamentos (histórico)
CREATE TABLE IF NOT EXISTS produtos_funcionarios_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_funcionario_id UUID NOT NULL REFERENCES produtos_funcionarios(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  valor NUMERIC(10,2) NOT NULL,
  forma TEXT NOT NULL,           -- PIX, CARTAO, DINHEIRO, ESPECIE, DESCONTO_FOLHA, etc.
  conta TEXT,                    -- ITAU, INFINITEPAY, MERCADOPAGO, etc.
  parcelas INT DEFAULT 1,
  valor_liquido NUMERIC(10,2),   -- descontadas taxas
  observacao TEXT,
  criado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prodfunc_pag_pf ON produtos_funcionarios_pagamentos(produto_funcionario_id);

-- 3) estoque.status eh TEXT livre — COM_FUNCIONARIO sera apenas mais um valor.
-- Nenhuma alteracao de schema necessaria.
