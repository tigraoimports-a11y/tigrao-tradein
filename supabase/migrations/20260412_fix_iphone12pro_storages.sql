-- iPhone 12 Pro nao existe em 64GB. Armazenamentos corretos: 128GB, 256GB, 512GB
-- Remove entrada invalida
DELETE FROM avaliacao_usados WHERE modelo = 'iPhone 12 Pro' AND armazenamento = '64GB';

-- Garante que 512GB existe (se nao existir, cria com valor base 0 para ser preenchido)
INSERT INTO avaliacao_usados (modelo, armazenamento, valor_base, ativo)
VALUES ('iPhone 12 Pro', '512GB', 0, true)
ON CONFLICT (modelo, armazenamento) DO NOTHING;

-- Mesma correcao para iPhone 12 Pro Max (tambem nao tem 64GB)
DELETE FROM avaliacao_usados WHERE modelo = 'iPhone 12 Pro Max' AND armazenamento = '64GB';

INSERT INTO avaliacao_usados (modelo, armazenamento, valor_base, ativo)
VALUES ('iPhone 12 Pro Max', '512GB', 0, true)
ON CONFLICT (modelo, armazenamento) DO NOTHING;
