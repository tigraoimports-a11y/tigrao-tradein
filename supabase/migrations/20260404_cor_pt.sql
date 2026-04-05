-- Adicionar campo cor_pt para armazenar nome da cor em português (customizado pelo usuário)
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS cor_pt TEXT;

-- Corrigir iPad Pro sem M5 no nome
UPDATE estoque
SET produto = REPLACE(produto, 'IPAD PRO 11" 256GB SILVER', 'IPAD PRO M5 11" 256GB SILVER WI-FI')
WHERE produto LIKE 'IPAD PRO 11" 256GB SILVER%'
  AND produto NOT LIKE '%M5%';
