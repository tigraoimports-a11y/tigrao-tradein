-- ============================================================
-- Catalogo dinamico de categorias, modelos e specs
-- Run this manually in Supabase SQL editor
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

-- Tipos de especificacao (ex: "Armazenamento", "Chip", "Tela", "Conectividade")
CREATE TABLE IF NOT EXISTS catalogo_spec_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true
);

-- Valores por tipo de spec (ex: "128GB", "M4", '11"')
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
-- SEED: Categorias
-- ============================================================

INSERT INTO catalogo_categorias (key, nome, emoji, usa_imei, usa_cor, tem_specs, ordem) VALUES
  ('IPHONES',     'iPhones',     '📱', true,  true,  true, 1),
  ('IPADS',       'iPads',       '📱', false, true,  true, 2),
  ('MACBOOK',     'MacBooks',    '💻', false, true,  true, 3),
  ('MAC_MINI',    'Mac Mini',    '🖥️', false, false, true, 4),
  ('APPLE_WATCH', 'Apple Watch', '⌚', false, true,  true, 5),
  ('AIRPODS',     'AirPods',     '🎧', false, true,  false, 6),
  ('ACESSORIOS',  'Acessorios',  '🔌', false, true,  false, 7),
  ('OUTROS',      'Outros',      '📦', false, true,  false, 8)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: Modelos IPHONES
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('IPHONES', '11',          1),
  ('IPHONES', '11 PRO',      2),
  ('IPHONES', '11 PRO MAX',  3),
  ('IPHONES', '12',          4),
  ('IPHONES', '12 PRO',      5),
  ('IPHONES', '12 PRO MAX',  6),
  ('IPHONES', '13',          7),
  ('IPHONES', '13 PRO',      8),
  ('IPHONES', '13 PRO MAX',  9),
  ('IPHONES', '14',          10),
  ('IPHONES', '14 PLUS',     11),
  ('IPHONES', '14 PRO',      12),
  ('IPHONES', '14 PRO MAX',  13),
  ('IPHONES', '15',          14),
  ('IPHONES', '15 PLUS',     15),
  ('IPHONES', '15 PRO',      16),
  ('IPHONES', '15 PRO MAX',  17),
  ('IPHONES', '16',          18),
  ('IPHONES', '16 PLUS',     19),
  ('IPHONES', '16 PRO',      20),
  ('IPHONES', '16 PRO MAX',  21),
  ('IPHONES', '16E',         22),
  ('IPHONES', '17',          23),
  ('IPHONES', '17 AIR',      24),
  ('IPHONES', '17 PRO',      25),
  ('IPHONES', '17 PRO MAX',  26)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos IPADS
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('IPADS', 'IPAD', 1),
  ('IPADS', 'MINI', 2),
  ('IPADS', 'AIR',  3),
  ('IPADS', 'PRO',  4)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos MACBOOK
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('MACBOOK', 'AIR', 1),
  ('MACBOOK', 'PRO', 2),
  ('MACBOOK', 'NEO', 3)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos APPLE_WATCH
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('APPLE_WATCH', 'SE 2',            1),
  ('APPLE_WATCH', 'SE 3',            2),
  ('APPLE_WATCH', 'SERIES 11',       3),
  ('APPLE_WATCH', 'ULTRA 3',         4),
  ('APPLE_WATCH', 'ULTRA 3 MILANES', 5)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Modelos AIRPODS
-- ============================================================

INSERT INTO catalogo_modelos (categoria_key, nome, ordem) VALUES
  ('AIRPODS', 'AIRPODS 4',      1),
  ('AIRPODS', 'AIRPODS 4 ANC',  2),
  ('AIRPODS', 'AIRPODS PRO 2',  3),
  ('AIRPODS', 'AIRPODS PRO 3',  4),
  ('AIRPODS', 'AIRPODS MAX',    5),
  ('AIRPODS', 'AIRPODS MAX 2',  6)
ON CONFLICT (categoria_key, nome) DO NOTHING;

-- ============================================================
-- SEED: Spec Tipos
-- ============================================================

INSERT INTO catalogo_spec_tipos (chave, nome, ordem) VALUES
  ('storage',       'Armazenamento',  1),
  ('chip',          'Chip',           2),
  ('tela',          'Tela',           3),
  ('ram',           'RAM',            4),
  ('conn_ipad',     'Conectividade iPad', 5),
  ('conn_watch',    'Conectividade Watch', 6),
  ('tamanho_watch', 'Tamanho Watch',  7),
  ('pulseira',      'Pulseira',       8),
  ('origem',        'Origem iPhone',  9)
ON CONFLICT (chave) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - storage
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('storage', '64GB',  1),
  ('storage', '128GB', 2),
  ('storage', '256GB', 3),
  ('storage', '512GB', 4),
  ('storage', '1TB',   5),
  ('storage', '2TB',   6)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - chip
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('chip', 'M1',      1),
  ('chip', 'M2',      2),
  ('chip', 'M2 PRO',  3),
  ('chip', 'M3',      4),
  ('chip', 'M3 PRO',  5),
  ('chip', 'M3 MAX',  6),
  ('chip', 'M4',      7),
  ('chip', 'M4 PRO',  8),
  ('chip', 'M4 MAX',  9),
  ('chip', 'M5',      10),
  ('chip', 'M5 PRO',  11),
  ('chip', 'M5 MAX',  12),
  ('chip', 'A16',     13),
  ('chip', 'A17 PRO', 14)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - tela
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('tela', '8.3"',  1),
  ('tela', '10.9"', 2),
  ('tela', '11"',   3),
  ('tela', '12.9"', 4),
  ('tela', '13"',   5),
  ('tela', '14"',   6),
  ('tela', '15"',   7),
  ('tela', '16"',   8)
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
-- SEED: Spec Valores - conn_ipad
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('conn_ipad', 'WIFI',      1),
  ('conn_ipad', 'WIFI+CELL', 2)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - conn_watch
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('conn_watch', 'GPS',      1),
  ('conn_watch', 'GPS+CELL', 2)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - tamanho_watch
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('tamanho_watch', '40mm', 1),
  ('tamanho_watch', '42mm', 2),
  ('tamanho_watch', '44mm', 3),
  ('tamanho_watch', '45mm', 4),
  ('tamanho_watch', '46mm', 5),
  ('tamanho_watch', '49mm', 6)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - pulseira
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('pulseira', 'S/M',      1),
  ('pulseira', 'M/L',      2),
  ('pulseira', 'One Size', 3)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Spec Valores - origem
-- ============================================================

INSERT INTO catalogo_spec_valores (tipo_chave, valor, ordem) VALUES
  ('origem', 'AA (EAU) - E-sim',                  1),
  ('origem', 'BE (BR) - Chip Fisico + E-sim',      2),
  ('origem', 'BR - Chip Fisico + E-sim',           3),
  ('origem', 'BZ (BR) - Chip Fisico + E-sim',      4),
  ('origem', 'CH - Chip Fisico',                   5),
  ('origem', 'E (MEX) - Chip Fisico + E-sim',      6),
  ('origem', 'HN (IN) - Chip Fisico + E-sim',      7),
  ('origem', 'J (JPA) - E-sim',                    8),
  ('origem', 'LL (EUA) - E-sim',                   9),
  ('origem', 'LZ (CL/PY/UY) - Chip Fisico + E-sim', 10),
  ('origem', 'N (UK) - E-sim',                     11),
  ('origem', 'QL (IT, PT, ES) - Chip Fisico + E-sim', 12),
  ('origem', 'VC (CAN) - E-sim',                   13),
  ('origem', 'ZD (EUROPE) - Chip Fisico + E-Sim',  14),
  ('origem', 'ZP (HK/MO) - E-sim',                 15)
ON CONFLICT (tipo_chave, valor) DO NOTHING;

-- ============================================================
-- SEED: Categoria Specs assignments
-- ============================================================

-- IPHONES: storage, origem
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('IPHONES', 'storage', true,  1),
  ('IPHONES', 'origem',  false, 2)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- IPADS: chip, tela, storage, conn_ipad
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('IPADS', 'chip',      false, 1),
  ('IPADS', 'tela',      true,  2),
  ('IPADS', 'storage',   true,  3),
  ('IPADS', 'conn_ipad', true,  4)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MACBOOK: chip, tela, ram, storage
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MACBOOK', 'chip',    true, 1),
  ('MACBOOK', 'tela',    true, 2),
  ('MACBOOK', 'ram',     true, 3),
  ('MACBOOK', 'storage', true, 4)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- MAC_MINI: chip, ram, storage
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('MAC_MINI', 'chip',    true, 1),
  ('MAC_MINI', 'ram',     true, 2),
  ('MAC_MINI', 'storage', true, 3)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;

-- APPLE_WATCH: tamanho_watch, conn_watch, pulseira
INSERT INTO catalogo_categoria_specs (categoria_key, tipo_chave, obrigatoria, ordem) VALUES
  ('APPLE_WATCH', 'tamanho_watch', true,  1),
  ('APPLE_WATCH', 'conn_watch',    true,  2),
  ('APPLE_WATCH', 'pulseira',      false, 3)
ON CONFLICT (categoria_key, tipo_chave) DO NOTHING;
