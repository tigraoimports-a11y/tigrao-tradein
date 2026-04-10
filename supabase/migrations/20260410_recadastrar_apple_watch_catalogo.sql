-- Recadastrar modelos Apple Watch que sumiram do catalogo_modelos
-- NÃO TOCA em estoque, vendas, entregas — só catálogo de cores

-- 1) Reinserir modelos (ON CONFLICT ignora se já existir)
INSERT INTO catalogo_modelos (categoria_key, nome, ordem, ativo) VALUES
  ('APPLE_WATCH', 'Apple Watch SE 2ª geração',  1, true),
  ('APPLE_WATCH', 'Apple Watch SE 3ª geração',  2, true),
  ('APPLE_WATCH', 'Apple Watch Series 8',       3, true),
  ('APPLE_WATCH', 'Apple Watch Series 9',       4, true),
  ('APPLE_WATCH', 'Apple Watch Series 10',      5, true),
  ('APPLE_WATCH', 'Apple Watch Series 11',      6, true),
  ('APPLE_WATCH', 'Apple Watch Ultra 1',        7, true),
  ('APPLE_WATCH', 'Apple Watch Ultra 2',        8, true),
  ('APPLE_WATCH', 'Apple Watch Ultra 3',        9, true)
ON CONFLICT (categoria_key, nome) DO UPDATE SET ativo = true;

-- 2) Inserir cores para cada modelo
-- SE 2ª geração: Estelar, Meia-noite, Prateado
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Starlight'), ('Midnight'), ('Silver')) AS c(cor)
WHERE m.nome = 'Apple Watch SE 2ª geração' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- SE 3ª geração: Estelar, Meia-noite
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Starlight'), ('Midnight')) AS c(cor)
WHERE m.nome = 'Apple Watch SE 3ª geração' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 8: Meia-noite, Estelar, Prateado, Red
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Midnight'), ('Starlight'), ('Silver'), ('Red')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 8' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 9: Meia-noite, Estelar, Prateado, Red, Rosa
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Midnight'), ('Starlight'), ('Silver'), ('Red'), ('Pink')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 9' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 10: Ouro Rosa, Prateado, Preto Brilhante, Cinza-espacial
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Rose Gold'), ('Silver'), ('Jet Black'), ('Space Gray')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 10' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 11: Ouro Rosa, Prateado, Preto Brilhante, Cinza-espacial (alumínio) + Natural, Dourado, Ardósia (titânio)
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Rose Gold'), ('Silver'), ('Jet Black'), ('Space Gray'), ('Natural Titanium'), ('Gold'), ('Slate')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 11' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Ultra 1: Natural Titanium
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Natural Titanium')) AS c(cor)
WHERE m.nome = 'Apple Watch Ultra 1' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Ultra 2: Black Titanium, Natural Titanium
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Black Titanium'), ('Natural Titanium')) AS c(cor)
WHERE m.nome = 'Apple Watch Ultra 2' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Ultra 3: Black Titanium, Natural Titanium
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Black Titanium'), ('Natural Titanium')) AS c(cor)
WHERE m.nome = 'Apple Watch Ultra 3' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;
