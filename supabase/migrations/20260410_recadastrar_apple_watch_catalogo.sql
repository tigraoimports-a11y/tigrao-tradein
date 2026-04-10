-- Recadastrar modelos Apple Watch que sumiram do catalogo_modelos
-- NÃO TOCA em estoque, vendas, entregas — só catálogo de cores

-- 1) Reinserir modelos (ON CONFLICT atualiza ativo=true)
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

-- 2) Garantir que as cores existam em catalogo_spec_valores (tipo_chave = cores_aw)
INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('cores_aw', 'Estelar',          1),
  ('cores_aw', 'Meia-noite',       2),
  ('cores_aw', 'Prateado',         3),
  ('cores_aw', 'Vermelho',         4),
  ('cores_aw', 'Rosa',             5),
  ('cores_aw', 'Ouro Rosa',        6),
  ('cores_aw', 'Preto Brilhante',  7),
  ('cores_aw', 'Cinza-espacial',   8),
  ('cores_aw', 'Titânio Natural',  9),
  ('cores_aw', 'Titânio Preto',    10),
  ('cores_aw', 'Dourado',          11),
  ('cores_aw', 'Ardósia',          12)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- 3) Inserir cores (em português) para cada modelo

-- SE 2ª geração: Estelar, Meia-noite, Prateado
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Estelar'), ('Meia-noite'), ('Prateado')) AS c(cor)
WHERE m.nome = 'Apple Watch SE 2ª geração' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- SE 3ª geração: Estelar, Meia-noite
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Estelar'), ('Meia-noite')) AS c(cor)
WHERE m.nome = 'Apple Watch SE 3ª geração' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 8: Meia-noite, Estelar, Prateado, Vermelho
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Meia-noite'), ('Estelar'), ('Prateado'), ('Vermelho')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 8' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 9: Meia-noite, Estelar, Prateado, Vermelho, Rosa
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Meia-noite'), ('Estelar'), ('Prateado'), ('Vermelho'), ('Rosa')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 9' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 10: Ouro Rosa, Prateado, Preto Brilhante, Cinza-espacial
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Ouro Rosa'), ('Prateado'), ('Preto Brilhante'), ('Cinza-espacial')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 10' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Series 11 alumínio + titânio: Ouro Rosa, Prateado, Preto Brilhante, Cinza-espacial, Titânio Natural, Dourado, Ardósia
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Ouro Rosa'), ('Prateado'), ('Preto Brilhante'), ('Cinza-espacial'), ('Titânio Natural'), ('Dourado'), ('Ardósia')) AS c(cor)
WHERE m.nome = 'Apple Watch Series 11' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Ultra 1: Titânio Natural
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Titânio Natural')) AS c(cor)
WHERE m.nome = 'Apple Watch Ultra 1' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Ultra 2: Titânio Preto, Titânio Natural
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Titânio Preto'), ('Titânio Natural')) AS c(cor)
WHERE m.nome = 'Apple Watch Ultra 2' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;

-- Ultra 3: Titânio Preto, Titânio Natural
INSERT INTO catalogo_modelo_configs (modelo_id, tipo_chave, valor)
SELECT m.id, 'cores_aw', c.cor
FROM catalogo_modelos m, (VALUES ('Titânio Preto'), ('Titânio Natural')) AS c(cor)
WHERE m.nome = 'Apple Watch Ultra 3' AND m.categoria_key = 'APPLE_WATCH'
ON CONFLICT DO NOTHING;
