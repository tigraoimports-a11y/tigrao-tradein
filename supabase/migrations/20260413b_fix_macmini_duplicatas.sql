-- Fix Mac Mini: renomear modelo "MacMini" → "Mac Mini" e remover duplicatas
-- A migration anterior (20260413_unificar_macmini) só mudou a categoria mas não o nome

-- 1. Renomear modelo: "MacMini" → "Mac Mini" (com espaço)
UPDATE precos SET modelo = REPLACE(modelo, 'MacMini', 'Mac Mini') WHERE modelo LIKE 'MacMini%';

-- 2. Remover duplicatas: quando existem 2 registros com mesmo modelo+armazenamento
--    (ex: "Mac Mini M4 16GB" 512GB aparece 2x), manter o mais antigo (menor id)
DELETE FROM precos a USING precos b
WHERE a.id > b.id
  AND UPPER(REPLACE(a.modelo, ' ', '')) = UPPER(REPLACE(b.modelo, ' ', ''))
  AND a.armazenamento = b.armazenamento;
