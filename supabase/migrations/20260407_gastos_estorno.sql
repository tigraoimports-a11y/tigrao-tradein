-- Suporte a categoria ESTORNO em gastos: vincula a um contato
-- (cliente / fornecedor / atacado) e opcionalmente a uma venda específica.
ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS contato_nome TEXT,
  ADD COLUMN IF NOT EXISTS contato_tipo TEXT, -- 'cliente' | 'fornecedor' | 'atacado'
  ADD COLUMN IF NOT EXISTS venda_id UUID;

CREATE INDEX IF NOT EXISTS idx_gastos_contato_nome ON gastos (contato_nome);
CREATE INDEX IF NOT EXISTS idx_gastos_venda_id ON gastos (venda_id);
