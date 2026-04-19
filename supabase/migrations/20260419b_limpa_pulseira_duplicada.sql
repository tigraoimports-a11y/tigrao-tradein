-- Limpa duplicacao "PULSEIRA PULSEIRA" em nomes de Apple Watch no estoque.
--
-- Contexto: buildProdutoName em lib/produto-specs.ts prependa "PULSEIRA " ao
-- valor de aw_pulseira. Como os valores no WATCH_BAND_MODELS comecam com
-- "Pulseira ..." (ex: "Pulseira natural estilo milanes"), o nome final ficava
-- "APPLE WATCH ... PULSEIRA PULSEIRA NATURAL ESTILO MILANES" (PULSEIRA duplicado).
--
-- Fix de codigo (produto-specs.ts) evita novas duplicacoes. Essa migration
-- limpa registros existentes no estoque e vendas.

-- 1) Estoque: colapsa "PULSEIRA PULSEIRA" (case-insensitive) em "PULSEIRA"
UPDATE estoque
SET produto = REGEXP_REPLACE(produto, '\mPULSEIRA\s+PULSEIRA\M', 'PULSEIRA', 'gi'),
    updated_at = NOW()
WHERE produto ~* '\mPULSEIRA\s+PULSEIRA\M';

-- 2) Vendas: mesma limpeza no campo produto
UPDATE vendas
SET produto = REGEXP_REPLACE(produto, '\mPULSEIRA\s+PULSEIRA\M', 'PULSEIRA', 'gi')
WHERE produto ~* '\mPULSEIRA\s+PULSEIRA\M';

-- 3) Vendas: mesma limpeza no campo troca_produto (seminovo recebido)
UPDATE vendas
SET troca_produto = REGEXP_REPLACE(troca_produto, '\mPULSEIRA\s+PULSEIRA\M', 'PULSEIRA', 'gi')
WHERE troca_produto ~* '\mPULSEIRA\s+PULSEIRA\M';

UPDATE vendas
SET troca_produto2 = REGEXP_REPLACE(troca_produto2, '\mPULSEIRA\s+PULSEIRA\M', 'PULSEIRA', 'gi')
WHERE troca_produto2 ~* '\mPULSEIRA\s+PULSEIRA\M';
