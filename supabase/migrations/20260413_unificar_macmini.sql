-- Unificar Mac Mini no painel de preços
-- 1. Categoria: todas as variantes → MAC_MINI
UPDATE precos SET categoria = 'MAC_MINI' WHERE UPPER(REPLACE(categoria, ' ', '')) LIKE '%MACMINI%';
UPDATE precos SET categoria = 'MAC_MINI' WHERE categoria = 'MACBOOK' AND UPPER(modelo) LIKE '%MAC%MINI%';

-- 2. Nome do modelo: "MacMini" → "Mac Mini" (com espaço)
UPDATE precos SET modelo = REPLACE(modelo, 'MacMini', 'Mac Mini') WHERE modelo LIKE 'MacMini%';

-- 3. Remover duplicatas: manter o registro com menor id (mais antigo)
DELETE FROM precos a USING precos b
WHERE a.id > b.id
  AND UPPER(REPLACE(a.modelo, ' ', '')) = UPPER(REPLACE(b.modelo, ' ', ''))
  AND a.armazenamento = b.armazenamento;
