-- ============================================================
-- Migration: Corrigir nomes de produtos cadastrados antes do
-- sistema de catalogo
-- ============================================================

-- 1. MacBook Neo: produtos com A18 no nome que ficaram como "MACBOOK PRO"
--    A18/A18 PRO e exclusivo do MacBook Neo
UPDATE estoque
SET produto = REGEXP_REPLACE(produto, 'MACBOOK\s+PRO\s+(A18)', 'MACBOOK NEO \1', 'gi'),
    updated_at = NOW()
WHERE categoria = 'MACBOOK'
  AND produto ~* '\bA18\b'
  AND produto ~* 'MACBOOK\s+PRO';

-- 2. Tambem corrigir na tabela produtos_individuais
UPDATE produtos_individuais
SET produto = REGEXP_REPLACE(produto, 'MACBOOK\s+PRO\s+(A18)', 'MACBOOK NEO \1', 'gi'),
    updated_at = NOW()
WHERE produto ~* '\bA18\b'
  AND produto ~* 'MACBOOK\s+PRO';

-- 3. iPad Air: produtos "IPAD AIR" sem chip no nome -> adicionar M3
--    Afeta iPads Air cadastrados antes do sistema de catalogo
UPDATE estoque
SET produto = REGEXP_REPLACE(produto, 'IPAD\s+AIR\s+(\d)', 'IPAD AIR M3 \1', 'i'),
    updated_at = NOW()
WHERE categoria = 'IPADS'
  AND produto ~* 'IPAD\s+AIR'
  AND produto !~* 'IPAD\s+AIR\s+(M\d|A\d|\d+(º|o)\b)';

-- 4. Tambem corrigir na tabela produtos_individuais
UPDATE produtos_individuais
SET produto = REGEXP_REPLACE(produto, 'IPAD\s+AIR\s+(\d)', 'IPAD AIR M3 \1', 'i'),
    updated_at = NOW()
WHERE produto ~* 'IPAD\s+AIR'
  AND produto !~* 'IPAD\s+AIR\s+(M\d|A\d|\d+(º|o)\b)';
