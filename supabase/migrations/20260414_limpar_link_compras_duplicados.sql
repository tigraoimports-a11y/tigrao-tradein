-- Limpar link_compras duplicados: quando o mesmo cliente (telefone) tem múltiplas
-- entradas para o mesmo produto, manter apenas a mais recente.
-- Só afeta links com status ATIVO ou PREENCHIDO (não toca em CONVERTIDO/ENCAMINHADO/ARQUIVADO).
DELETE FROM link_compras a
USING link_compras b
WHERE a.id < b.id
  AND a.cliente_telefone IS NOT NULL
  AND a.cliente_telefone = b.cliente_telefone
  AND a.produto = b.produto
  AND a.status IN ('ATIVO', 'PREENCHIDO')
  AND b.status IN ('ATIVO', 'PREENCHIDO');
