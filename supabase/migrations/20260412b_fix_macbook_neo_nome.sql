-- Corrige nomes de MacBook Neo que contem "=" solto no nome do produto
-- Ex: "MACBOOK NEO A18 PRO 13" = 8GB 256GB" → "MACBOOK NEO A18 PRO 13" 8GB 256GB"
UPDATE estoque
SET produto = REPLACE(produto, '= ', ''),
    updated_at = NOW()
WHERE produto ILIKE '%MACBOOK NEO%'
  AND produto LIKE '%=%';
