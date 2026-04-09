-- Copia descontos do iPhone 16 para iPhone 17 (linha nova sem descontos específicos)
-- Copia bateria, riscos, etc. mantendo os mesmos valores de referência

-- iPhone 17 (copia do 16)
INSERT INTO descontos_condicao (condicao, detalhe, desconto)
SELECT
  replace(condicao, 'iPhone 16 -', 'iPhone 17 -'),
  detalhe,
  desconto
FROM descontos_condicao
WHERE condicao LIKE 'iPhone 16 - %'
  AND condicao NOT LIKE 'iPhone 16 Pro%'
  AND condicao NOT LIKE 'iPhone 16 Plus%'
ON CONFLICT (condicao, detalhe) DO NOTHING;

-- iPhone 17 Air (copia do 16 base — é a linha mais próxima)
INSERT INTO descontos_condicao (condicao, detalhe, desconto)
SELECT
  replace(condicao, 'iPhone 16 -', 'iPhone 17 Air -'),
  detalhe,
  desconto
FROM descontos_condicao
WHERE condicao LIKE 'iPhone 16 - %'
  AND condicao NOT LIKE 'iPhone 16 Pro%'
  AND condicao NOT LIKE 'iPhone 16 Plus%'
ON CONFLICT (condicao, detalhe) DO NOTHING;

-- iPhone 17 Pro (copia do 16 Pro)
INSERT INTO descontos_condicao (condicao, detalhe, desconto)
SELECT
  replace(condicao, 'iPhone 16 Pro -', 'iPhone 17 Pro -'),
  detalhe,
  desconto
FROM descontos_condicao
WHERE condicao LIKE 'iPhone 16 Pro - %'
  AND condicao NOT LIKE 'iPhone 16 Pro Max%'
ON CONFLICT (condicao, detalhe) DO NOTHING;

-- iPhone 17 Pro Max (copia do 16 Pro Max)
INSERT INTO descontos_condicao (condicao, detalhe, desconto)
SELECT
  replace(condicao, 'iPhone 16 Pro Max -', 'iPhone 17 Pro Max -'),
  detalhe,
  desconto
FROM descontos_condicao
WHERE condicao LIKE 'iPhone 16 Pro Max - %'
ON CONFLICT (condicao, detalhe) DO NOTHING;
