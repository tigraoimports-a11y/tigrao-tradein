-- =====================================================================
-- Migration: Correções finais — itens sem S/N, HLHW, Mac Mini
-- =====================================================================

-- 1. Remover itens sem serial dos gastos (fantasmas da migration anterior)
-- ─────────────────────────────────────────────────────────────────────────
DELETE FROM estoque WHERE id = 'abeee3ba-0f2b-430a-9290-9c7f219e6f93';
DELETE FROM estoque WHERE id = '522cbb79-3d58-4ac9-8b2a-41674b350efb';

-- 2. HLHW9X274W — corrigir dados: Lacrado, R$7.500, entrada 08/04/2026
-- ─────────────────────────────────────────────────────────────────────
UPDATE estoque
SET tipo = 'NOVO',
    custo_unitario = 7500,
    data_compra = '2026-04-08',
    data_entrada = '2026-04-08',
    fornecedor = 'MAURO MANTUANO',
    cliente = 'MAURO MANTUANO',
    cor = NULL,
    updated_at = NOW()
WHERE serial_no = 'HLHW9X274W';
