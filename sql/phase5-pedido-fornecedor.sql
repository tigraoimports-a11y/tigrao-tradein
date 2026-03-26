-- Liga gastos e estoque via um ID de pedido de fornecedor compartilhado.
-- Quando um gasto de categoria FORNECEDOR é registrado com produtos,
-- ambos recebem o mesmo pedido_fornecedor_id.
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS pedido_fornecedor_id UUID;
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS pedido_fornecedor_id UUID;

CREATE INDEX IF NOT EXISTS idx_gastos_pedido_fornecedor ON gastos(pedido_fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_estoque_pedido_fornecedor ON estoque(pedido_fornecedor_id);
