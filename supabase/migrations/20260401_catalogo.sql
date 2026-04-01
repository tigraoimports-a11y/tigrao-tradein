-- ============================================================
-- Catalogo dinamico de categorias, modelos e specs
-- Importado do sistema antigo tigrao.meumobi.dev
-- Run this manually in Supabase SQL Editor
-- ============================================================

-- Categorias de produto
CREATE TABLE IF NOT EXISTS catalogo_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  usa_imei BOOLEAN NOT NULL DEFAULT false,
  usa_cor BOOLEAN NOT NULL DEFAULT true,
  tem_specs BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Modelos por categoria
CREATE TABLE IF NOT EXISTS catalogo_modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_key TEXT NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (categoria_key, nome)
);

-- Tipos de especificacao
CREATE TABLE IF NOT EXISTS catalogo_spec_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true
);

-- Valores por tipo de spec
CREATE TABLE IF NOT EXISTS catalogo_spec_valores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_chave TEXT NOT NULL,
  valor TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tipo_chave, valor)
);

-- Quais spec tipos pertencem a qual categoria
CREATE TABLE IF NOT EXISTS catalogo_categoria_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_key TEXT NOT NULL,
  tipo_chave TEXT NOT NULL,
  obrigatoria BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  UNIQUE (categoria_key, tipo_chave)
);

-- ============================================================
-- Limpar dados existentes para reimportar do sistema antigo
-- ============================================================
DELETE FROM catalogo_categoria_specs;
DELETE FROM catalogo_spec_valores;
DELETE FROM catalogo_spec_tipos;
DELETE FROM catalogo_modelos;
DELETE FROM catalogo_categorias;

-- ============================================================
-- SEED: Categorias
-- ============================================================

INSERT INTO catalogo_categorias (key, nome, emoji, usa_imei, usa_cor, tem_specs, ordem) VALUES
  ('IPHONES',     'iPhones',     '📱', true,  true,  true, 1),
  ('IPADS',       'iPads',       '📱', true,  true,  true, 2),
  ('MACBOOK_AIR', 'MacBook Air', '💻', false, true,  true, 3),
  ('MACBOOK_PRO', 'MacBook Pro', '💻', false, true,  true, 4),
  ('MACBOOK_NEO', 'MacBook Neo', '💻', false, true,  true, 5),
  ('MAC_MINI',    'Mac Mini',    '🖥️', false, false, true, 6),
  ('MAC_STUDIO',  'Mac Studio',  '🖥️', false, false, true, 7),
  ('IMAC',        'iMac',        '🖥️', false, true,  true, 8),
  ('APPLE_WATCH', 'Apple Watch', '⌚', true,  true,  true, 9),
  ('AIRPODS',     'AirPods',     '🎧', false, true,  true, 10),
  ('ACESSORIOS',  'Acessórios',  '🔌', false, true,  true, 11),
  ('OUTROS',      'Outros',      '📦', false, true,  false, 12)
ON CONFLICT (key) DO UPDATE SET nome = EXCLUDED.nome, emoji = EXCLUDED.emoji, usa_imei = EXCLUDED.usa_imei, usa_cor = EXCLUDED.usa_cor, tem_specs = EXCLUDED.tem_specs, ordem = EXCLUDED.ordem;

-- ============================================================
-- SEED: Modelos IPHONES
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('IPHONES', 'iPhone 11',           1),
  ('IPHONES', 'iPhone 11 Pro',       2),
  ('IPHONES', 'iPhone 11 Pro Max',   3),
  ('IPHONES', 'iPhone 12',           4),
  ('IPHONES', 'iPhone 12 Pro',       5),
  ('IPHONES', 'iPhone 12 Pro Max',   6),
  ('IPHONES', 'iPhone 13',           7),
  ('IPHONES', 'iPhone 13 Pro',       8),
  ('IPHONES', 'iPhone 13 Pro Max',   9),
  ('IPHONES', 'iPhone 14',           10),
  ('IPHONES', 'iPhone 14 Plus',      11),
  ('IPHONES', 'iPhone 14 Pro',       12),
  ('IPHONES', 'iPhone 14 Pro Max',   13),
  ('IPHONES', 'iPhone 15',           14),
  ('IPHONES', 'iPhone 15 Plus',      15),
  ('IPHONES', 'iPhone 15 Pro',       16),
  ('IPHONES', 'iPhone 15 Pro Max',   17),
  ('IPHONES', 'iPhone 16',           18),
  ('IPHONES', 'iPhone 16 Plus',      19),
  ('IPHONES', 'iPhone 16 Pro',       20),
  ('IPHONES', 'iPhone 16 Pro Max',   21),
  ('IPHONES', 'iPhone 17',           22),
  ('IPHONES', 'iPhone 17 Air',       23),
  ('IPHONES', 'iPhone 17 Pro',       24),
  ('IPHONES', 'iPhone 17 Pro Max',   25)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos IPADS
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('IPADS', 'iPad 9º',       1),
  ('IPADS', 'iPad 10º',      2),
  ('IPADS', 'iPad 11º (A16)',3),
  ('IPADS', 'iPad Air 4º',   4),
  ('IPADS', 'iPad Air 5º',   5),
  ('IPADS', 'iPad Air M2',   6),
  ('IPADS', 'iPad Air M3',   7),
  ('IPADS', 'iPad Mini 6º',  8),
  ('IPADS', 'iPad Mini 7º',  9),
  ('IPADS', 'iPad Pro 4º',   10),
  ('IPADS', 'iPad Pro 5º',   11),
  ('IPADS', 'iPad Pro 6º',   12),
  ('IPADS', 'iPad Pro M4',   13),
  ('IPADS', 'iPad Pro M5',   14)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos MACBOOK_AIR
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('MACBOOK_AIR', 'MacBook Air M1', 1),
  ('MACBOOK_AIR', 'MacBook Air M2', 2),
  ('MACBOOK_AIR', 'MacBook Air M3', 3),
  ('MACBOOK_AIR', 'MacBook Air M4', 4),
  ('MACBOOK_AIR', 'MacBook Air M5', 5)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos MACBOOK_PRO
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('MACBOOK_PRO', 'MacBook Pro M1',     1),
  ('MACBOOK_PRO', 'MacBook Pro M2',     2),
  ('MACBOOK_PRO', 'MacBook Pro M2 Pro', 3),
  ('MACBOOK_PRO', 'MacBook Pro M4',     4),
  ('MACBOOK_PRO', 'MacBook Pro M4 Pro', 5),
  ('MACBOOK_PRO', 'MacBook Pro M4 Max', 6),
  ('MACBOOK_PRO', 'MacBook Pro M5',     7),
  ('MACBOOK_PRO', 'MacBook Pro M5 Pro', 8)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos MACBOOK_NEO
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('MACBOOK_NEO', 'MacBook Neo', 1)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos MAC_MINI
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('MAC_MINI', 'MacMini M4',     1),
  ('MAC_MINI', 'MacMini M4 Pro', 2)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos MAC_STUDIO
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('MAC_STUDIO', 'MacStudio', 1)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos IMAC
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('IMAC', 'iMac', 1)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos APPLE_WATCH
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('APPLE_WATCH', 'Apple Watch SE (2rd generation)',  1),
  ('APPLE_WATCH', 'Apple Watch SE (3rd generation)',  2),
  ('APPLE_WATCH', 'Apple Watch Series 8',             3),
  ('APPLE_WATCH', 'Apple Watch Series 9',             4),
  ('APPLE_WATCH', 'Apple Watch Series 10',            5),
  ('APPLE_WATCH', 'Apple Watch Series 11',            6),
  ('APPLE_WATCH', 'Apple Watch Ultra 1',              7),
  ('APPLE_WATCH', 'Apple Watch Ultra 2',              8),
  ('APPLE_WATCH', 'Apple Watch Ultra 3',              9)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos AIRPODS
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('AIRPODS', 'AirPods 4º',      1),
  ('AIRPODS', 'AirPods Max 2024',2),
  ('AIRPODS', 'AirPods Pro 2º',  3),
  ('AIRPODS', 'AirPods Pro 3º',  4)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos ACESSORIOS
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('ACESSORIOS', 'Adaptador HDMI Apple',        1),
  ('ACESSORIOS', 'AirTag Pack 4',               2),
  ('ACESSORIOS', 'Apple Pencil 1º',             3),
  ('ACESSORIOS', 'Apple Pencil 2º',             4),
  ('ACESSORIOS', 'Apple Pencil Pro',            5),
  ('ACESSORIOS', 'Apple Pencil USB-C',          6),
  ('ACESSORIOS', 'Cabo USB-C Apple',            7),
  ('ACESSORIOS', 'Capa',                        8),
  ('ACESSORIOS', 'Dock Station',                9),
  ('ACESSORIOS', 'Fonte Apple 20W',             10),
  ('ACESSORIOS', 'Magic Keyboard iPad A16',     11),
  ('ACESSORIOS', 'Magic Keyboard iPad Air M3',  12),
  ('ACESSORIOS', 'Magic Keyboard iPad Pro 5º',  13),
  ('ACESSORIOS', 'Magic Keyboard iPad Pro M4',  14),
  ('ACESSORIOS', 'Magic KeyBoard Mac',          15),
  ('ACESSORIOS', 'Magic KeyBoard Mac Touch ID', 16),
  ('ACESSORIOS', 'Magic Mouse 2º',              17),
  ('ACESSORIOS', 'Magic Mouse USB-C',           18),
  ('ACESSORIOS', 'Película',                    19),
  ('ACESSORIOS', 'Pulseira',                    20)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Spec Tipos
-- ============================================================

INSERT INTO catalogo_spec_tipos (chave, nome, ordem) VALUES
  ('capacidade',       'Capacidade',          1),
  ('ssd',              'SSD',                 2),
  ('ram',              'RAM',                 3),
  ('chips_air',        'Chips Air',           4),
  ('chips_pro_max',    'Chips Pro/Max',       5),
  ('chips_max',        'Chips Max',           6),
  ('telas',            'Telas',               7),
  ('conectividade',    'Conectividade',       8),
  ('conectividade_aw', 'Conectividade AW',    9),
  ('cores',            'Cores',               10),
  ('cores_aw',         'Cores AW',            11),
  ('origem',           'Origem',              12),
  ('tamanho_aw',       'Tamanho AW',          13),
  ('tamanho_pulseira', 'Tamanho Pulseira',    14),
  ('pulseiras',        'Pulseiras',           15),
  ('descricao_airpods','Descrição AirPods',   16),
  ('capa_pelicula',    'Capa/Película',       17),
  ('marca',            'Marca',               18)
ON CONFLICT (chave) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem;

-- ============================================================
-- SEED: Spec Valores - capacidade (iPhone / iPad)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('capacidade', '64GB',  1),
  ('capacidade', '128GB', 2),
  ('capacidade', '256GB', 3),
  ('capacidade', '512GB', 4),
  ('capacidade', '1TB',   5),
  ('capacidade', '2TB',   6)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - ssd (MacBook / Mac)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('ssd', '256GB', 1),
  ('ssd', '512GB', 2),
  ('ssd', '1TB',   3),
  ('ssd', '2TB',   4)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - ram
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('ram', '8GB',   1),
  ('ram', '16GB',  2),
  ('ram', '24GB',  3),
  ('ram', '32GB',  4),
  ('ram', '36GB',  5),
  ('ram', '48GB',  6),
  ('ram', '64GB',  7),
  ('ram', '128GB', 8),
  ('ram', '256GB', 9)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - chips_air
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('chips_air', '(6C CPU/5C GPU)',   1),
  ('chips_air', '(8C CPU/7C GPU)',   2),
  ('chips_air', '(8C CPU/8C GPU)',   3),
  ('chips_air', '(8C CPU/10C GPU)',  4),
  ('chips_air', '(10C CPU/8C GPU)',  5),
  ('chips_air', '(10C CPU/10C GPU)', 6)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - chips_pro_max
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('chips_pro_max', '(8C CPU/8C GPU)',    1),
  ('chips_pro_max', '(8C CPU/10C GPU)',   2),
  ('chips_pro_max', '(10C CPU/10C GPU)',  3),
  ('chips_pro_max', '(12C CPU/16C GPU)',  4),
  ('chips_pro_max', '(12C CPU /19C GPU)', 5),
  ('chips_pro_max', '(14C CPU/20C GPU)',  6),
  ('chips_pro_max', '(14C CPU /32C GPU)', 7),
  ('chips_pro_max', '(16C CPU /40C GPU)', 8)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - chips_max (Mac Studio)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('chips_max', 'M4 Pro (14C CPU /32C GPU)',  1),
  ('chips_max', 'M4 Pro (16C CPU /40C GPU)',  2),
  ('chips_max', 'M4 Max (14C CPU /32C GPU)',  3)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - telas
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('telas', '8.3"',  1),
  ('telas', '10.2"', 2),
  ('telas', '10.8"', 3),
  ('telas', '10.9"', 4),
  ('telas', '11"',   5),
  ('telas', '12.9"', 6),
  ('telas', '13"',   7),
  ('telas', '14"',   8),
  ('telas', '15"',   9),
  ('telas', '16"',   10)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - conectividade (iPad)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('conectividade', 'Wi-Fi',      1),
  ('conectividade', 'Wi-Fi + Cel',2)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - conectividade_aw (Apple Watch)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('conectividade_aw', 'GPS',      1),
  ('conectividade_aw', 'GPS + CEL',2)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - cores (iPhone / iPad / MacBook / iMac)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('cores', 'Alpine Green',    1),
  ('cores', 'Black',           2),
  ('cores', 'Black Titanium',  3),
  ('cores', 'Blue',            4),
  ('cores', 'Blue Titanium',   5),
  ('cores', 'Blush',           6),
  ('cores', 'Citrus',          7),
  ('cores', 'Cloud White',     8),
  ('cores', 'Cosmic Orange',   9),
  ('cores', 'Deep Blue',       10),
  ('cores', 'Deep Purple',     11),
  ('cores', 'Desert Titanium', 12),
  ('cores', 'Gold',            13),
  ('cores', 'Graphite',        14),
  ('cores', 'Green',           15),
  ('cores', 'Indigo',          16),
  ('cores', 'Lavender',        17),
  ('cores', 'Light Gold',      18),
  ('cores', 'Midnight',        19),
  ('cores', 'Midnight Green',  20),
  ('cores', 'Mist Blue',       21),
  ('cores', 'Natural Titanium',22),
  ('cores', 'Pacific Blue',    23),
  ('cores', 'Pink',            24),
  ('cores', 'Purple',          25),
  ('cores', 'Red',             26),
  ('cores', 'Sage',            27),
  ('cores', 'Sierra Blue',     28),
  ('cores', 'Silver',          29),
  ('cores', 'Sky Blue',        30),
  ('cores', 'Space Black',     31),
  ('cores', 'Space Gray',      32),
  ('cores', 'Starlight',       33),
  ('cores', 'Teal',            34),
  ('cores', 'Ultramarine',     35),
  ('cores', 'White',           36),
  ('cores', 'White Titanium',  37),
  ('cores', 'Yellow',          38)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - cores_aw (Apple Watch)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('cores_aw', 'Black Titanium',  1),
  ('cores_aw', 'Gold',            2),
  ('cores_aw', 'Graphite',        3),
  ('cores_aw', 'Jet Black',       4),
  ('cores_aw', 'Midnight',        5),
  ('cores_aw', 'Natural',         6),
  ('cores_aw', 'Natural Titanium',7),
  ('cores_aw', 'Pink',            8),
  ('cores_aw', 'Red',             9),
  ('cores_aw', 'Rose Gold',       10),
  ('cores_aw', 'Silver',          11),
  ('cores_aw', 'Slate',           12),
  ('cores_aw', 'Space Gray',      13),
  ('cores_aw', 'Starlight',       14)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - origem (iPhone)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('origem', 'AA (EAU)- E-sim',                    1),
  ('origem', 'BE (BR)- Chip Físico + E-sim',        2),
  ('origem', 'BR- Chip Físico + E-sim',             3),
  ('origem', 'BZ (BR)- Chip Físico + E-sim',        4),
  ('origem', 'CH- Chip Físico',                     5),
  ('origem', 'E (MEX)- Chip Físico + E-sim',        6),
  ('origem', 'HN (IN)- Chip Físico + E-sim',        7),
  ('origem', 'J (JPA)- E-sim',                      8),
  ('origem', 'LL (EUA)- E-sim',                     9),
  ('origem', 'LZ (CL/PY/UY)- Chip Físico + E-sim', 10),
  ('origem', 'N (UK)- E-sim',                       11),
  ('origem', 'QL (IT, PT, ES)- Chip Físico + E-sim',12),
  ('origem', 'VC (CAN)- E-sim',                     13),
  ('origem', 'ZD (EUROPE)- Chip Físico + E-Sim',    14),
  ('origem', 'ZP (HK/MO)- E-sim',                   15)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - tamanho_aw
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('tamanho_aw', '40mm', 1),
  ('tamanho_aw', '41mm', 2),
  ('tamanho_aw', '42mm', 3),
  ('tamanho_aw', '44mm', 4),
  ('tamanho_aw', '45mm', 5),
  ('tamanho_aw', '46mm', 6),
  ('tamanho_aw', '49mm', 7)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - tamanho_pulseira
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('tamanho_pulseira', 'S/M',      1),
  ('tamanho_pulseira', 'M/L',      2),
  ('tamanho_pulseira', 'One Size', 3)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - pulseiras (Apple Watch / Acessórios)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('pulseiras', 'Pulseira Esportiva Azul',             1),
  ('pulseiras', 'Pulseira Esportiva Estelar',          2),
  ('pulseiras', 'Pulseira Esportiva Preta',            3),
  ('pulseiras', 'Pulseira esportiva roxo-névoa',       4),
  ('pulseiras', 'Pulseira loop Alpina azul-clara',     5),
  ('pulseiras', 'Pulseira loop Alpina índigo',         6),
  ('pulseiras', 'Pulseira loop Alpina preta',          7),
  ('pulseiras', 'Pulseira loop Alpina verde',          8),
  ('pulseiras', 'Pulseira loop esportiva azul-âncora', 9),
  ('pulseiras', 'Pulseira loop esportiva cinza-escura',10),
  ('pulseiras', 'Pulseira loop Trail azul/azul-brilhante',11),
  ('pulseiras', 'Pulseira loop Trail azul/preta',      12),
  ('pulseiras', 'Pulseira loop Trail preta/carvão',    13),
  ('pulseiras', 'Pulseira natural estilo milanês',     14),
  ('pulseiras', 'Pulseira Ocean Azul',                 15),
  ('pulseiras', 'Pulseira Ocean Preta',                16),
  ('pulseiras', 'Puseira Ocean Verde-Neón',            17),
  ('pulseiras', 'Pulseira preta estilo milanês',       18)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - descricao_airpods
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('descricao_airpods', 'Com ANC',  1),
  ('descricao_airpods', 'Sem ANC',  2),
  ('descricao_airpods', 'USB-C',    3)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - capa_pelicula (Acessórios)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('capa_pelicula', 'iPhone 15',          1),
  ('capa_pelicula', 'iPhone 15 Pro',      2),
  ('capa_pelicula', 'iPhone 15 Pro Max',  3),
  ('capa_pelicula', 'iPhone 16',          4),
  ('capa_pelicula', 'iPhone 16 Plus',     5),
  ('capa_pelicula', 'iPhone 16 Pro',      6),
  ('capa_pelicula', 'iPhone 16 Pro Max',  7),
  ('capa_pelicula', 'iPhone 17',          8),
  ('capa_pelicula', 'iPhone 17 Air',      9),
  ('capa_pelicula', 'iPhone 17 Pro',      10),
  ('capa_pelicula', 'iPhone 17 Pro Max',  11)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - marca (Acessórios)
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('marca', 'Apple',   1),
  ('marca', 'Satechi', 2)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Categoria Specs assignments
-- ============================================================

-- IPHONES: capacidade (req), cores (req), origem (opt)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('IPHONES', 'capacidade', true,  1),
  ('IPHONES', 'cores',      true,  2),
  ('IPHONES', 'origem',     false, 3)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- IPADS: telas (req), capacidade (req), cores (req), conectividade (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('IPADS', 'telas',       true, 1),
  ('IPADS', 'capacidade',  true, 2),
  ('IPADS', 'cores',       true, 3),
  ('IPADS', 'conectividade',true, 4)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MACBOOK_AIR: chips_air (req), telas (req), cores (req), ram (req), ssd (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MACBOOK_AIR', 'chips_air', true, 1),
  ('MACBOOK_AIR', 'telas',     true, 2),
  ('MACBOOK_AIR', 'cores',     true, 3),
  ('MACBOOK_AIR', 'ram',       true, 4),
  ('MACBOOK_AIR', 'ssd',       true, 5)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MACBOOK_PRO: chips_pro_max (req), telas (req), cores (req), ram (req), ssd (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MACBOOK_PRO', 'chips_pro_max', true, 1),
  ('MACBOOK_PRO', 'telas',         true, 2),
  ('MACBOOK_PRO', 'cores',         true, 3),
  ('MACBOOK_PRO', 'ram',           true, 4),
  ('MACBOOK_PRO', 'ssd',           true, 5)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MACBOOK_NEO: chips_air (req), cores (req), ram (req), ssd (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MACBOOK_NEO', 'chips_air', true, 1),
  ('MACBOOK_NEO', 'cores',     true, 2),
  ('MACBOOK_NEO', 'ram',       true, 3),
  ('MACBOOK_NEO', 'ssd',       true, 4)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MAC_MINI: chips_air (opt), chips_pro_max (req), ram (req), ssd (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MAC_MINI', 'chips_air',     false, 1),
  ('MAC_MINI', 'chips_pro_max', true,  2),
  ('MAC_MINI', 'ram',           true,  3),
  ('MAC_MINI', 'ssd',           true,  4)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MAC_STUDIO: chips_max (req), ram (req), ssd (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MAC_STUDIO', 'chips_max', true, 1),
  ('MAC_STUDIO', 'ram',       true, 2),
  ('MAC_STUDIO', 'ssd',       true, 3)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- IMAC: chips_air (req), ram (req), ssd (req), cores (req)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('IMAC', 'chips_air', true, 1),
  ('IMAC', 'ram',       true, 2),
  ('IMAC', 'ssd',       true, 3),
  ('IMAC', 'cores',     true, 4)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- APPLE_WATCH: tamanho_aw (req), cores_aw (opt), tamanho_pulseira (req), conectividade_aw (opt), pulseiras (opt)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('APPLE_WATCH', 'tamanho_aw',       true,  1),
  ('APPLE_WATCH', 'cores_aw',         false, 2),
  ('APPLE_WATCH', 'tamanho_pulseira', true,  3),
  ('APPLE_WATCH', 'conectividade_aw', false, 4),
  ('APPLE_WATCH', 'pulseiras',        false, 5)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- AIRPODS: descricao_airpods (opt), cores (opt)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('AIRPODS', 'descricao_airpods', false, 1),
  ('AIRPODS', 'cores',             false, 2)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- ACESSORIOS: telas (opt), cores (opt), capa_pelicula (opt), pulseiras (opt), marca (opt)
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('ACESSORIOS', 'telas',        false, 1),
  ('ACESSORIOS', 'cores',        false, 2),
  ('ACESSORIOS', 'capa_pelicula',false, 3),
  ('ACESSORIOS', 'pulseiras',    false, 4),
  ('ACESSORIOS', 'marca',        false, 5)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;
