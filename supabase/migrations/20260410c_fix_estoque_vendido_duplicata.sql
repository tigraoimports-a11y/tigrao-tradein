-- Fix: produto vendido JFXC1Q4Q3K ainda aparece em estoque
-- Marcar como ESGOTADO (foi vendido para G THREE LTDA)
UPDATE estoque
SET status = 'ESGOTADO', qnt = 0, updated_at = now()
WHERE serial_no = 'JFXC1Q4Q3K' AND status != 'ESGOTADO';

-- Fix: iPhone 17 Air 1TB duplicado — remover o que tem IMEI errado (manter o com serial correto)
-- Identificar: o item com serial_no preenchido é o correto. O que tem só IMEI é o errado.
-- Nota: precisa verificar manualmente os IDs exatos antes de rodar.
-- Este SQL identifica o duplicado: mesmo produto + cor, sem serial, com IMEI
-- DELETE FROM estoque WHERE produto ILIKE '%IPHONE 17 AIR%1TB%' AND serial_no IS NULL AND imei IS NOT NULL AND status = 'EM ESTOQUE';
-- ^ Comentado para segurança — verificar manualmente antes de rodar
