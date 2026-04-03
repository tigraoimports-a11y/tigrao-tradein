-- =====================================================
-- SEED: Modelos de iPad, MacBook e Apple Watch
-- para a tabela avaliacao_usados
--
-- INSTRUCOES:
-- 1. Ajuste os valores (valor_base) conforme sua tabela
-- 2. Cole no SQL Editor do Supabase e execute
-- 3. Modelos com valor 0 nao aparecem no trade-in (ativo=false)
-- =====================================================

-- ── iPAD ──

INSERT INTO avaliacao_usados (modelo, armazenamento, valor_base, ativo) VALUES
-- iPad 10a geracao
('iPad 10', '64GB', 2200, true),
('iPad 10', '256GB', 2600, true),
-- iPad Air M1
('iPad Air M1 11"', '64GB', 2800, true),
('iPad Air M1 11"', '256GB', 3200, true),
-- iPad Air M2
('iPad Air M2 11"', '128GB', 3500, true),
('iPad Air M2 11"', '256GB', 3800, true),
('iPad Air M2 11"', '512GB', 4200, true),
('iPad Air M2 11"', '1TB', 4800, true),
('iPad Air M2 13"', '128GB', 4200, true),
('iPad Air M2 13"', '256GB', 4500, true),
('iPad Air M2 13"', '512GB', 5000, true),
('iPad Air M2 13"', '1TB', 5500, true),
-- iPad Air M3
('iPad Air M3 11"', '128GB', 4000, true),
('iPad Air M3 11"', '256GB', 4300, true),
('iPad Air M3 11"', '512GB', 4800, true),
('iPad Air M3 11"', '1TB', 5400, true),
('iPad Air M3 13"', '128GB', 4800, true),
('iPad Air M3 13"', '256GB', 5100, true),
('iPad Air M3 13"', '512GB', 5600, true),
('iPad Air M3 13"', '1TB', 6200, true),
-- iPad Pro M2
('iPad Pro M2 11"', '128GB', 4000, true),
('iPad Pro M2 11"', '256GB', 4400, true),
('iPad Pro M2 11"', '512GB', 5000, true),
('iPad Pro M2 11"', '1TB', 5800, true),
('iPad Pro M2 13"', '128GB', 5200, true),
('iPad Pro M2 13"', '256GB', 5600, true),
('iPad Pro M2 13"', '512GB', 6200, true),
('iPad Pro M2 13"', '1TB', 7000, true),
-- iPad Pro M4
('iPad Pro M4 11"', '256GB', 5500, true),
('iPad Pro M4 11"', '512GB', 6200, true),
('iPad Pro M4 11"', '1TB', 7200, true),
('iPad Pro M4 13"', '256GB', 7000, true),
('iPad Pro M4 13"', '512GB', 7800, true),
('iPad Pro M4 13"', '1TB', 8800, true),
-- iPad mini
('iPad mini 6', '64GB', 2500, true),
('iPad mini 6', '256GB', 2900, true),
('iPad mini 7', '128GB', 3200, true),
('iPad mini 7', '256GB', 3600, true),
('iPad mini 7', '512GB', 4000, true)
ON CONFLICT (modelo, armazenamento) DO UPDATE SET valor_base = EXCLUDED.valor_base, ativo = EXCLUDED.ativo, updated_at = now();

-- ── MacBook ──

INSERT INTO avaliacao_usados (modelo, armazenamento, valor_base, ativo) VALUES
-- MacBook Air M1
('MacBook Air M1 13"', '256GB/8GB', 3800, true),
('MacBook Air M1 13"', '512GB/8GB', 4300, true),
-- MacBook Air M2
('MacBook Air M2 13"', '256GB/8GB', 4500, true),
('MacBook Air M2 13"', '512GB/8GB', 5000, true),
('MacBook Air M2 15"', '256GB/8GB', 5200, true),
('MacBook Air M2 15"', '512GB/8GB', 5700, true),
-- MacBook Air M3
('MacBook Air M3 13"', '256GB/16GB', 5500, true),
('MacBook Air M3 13"', '512GB/16GB', 6200, true),
('MacBook Air M3 15"', '256GB/16GB', 6000, true),
('MacBook Air M3 15"', '512GB/16GB', 6800, true),
-- MacBook Air M4
('MacBook Air M4 13"', '256GB/16GB', 6200, true),
('MacBook Air M4 13"', '512GB/24GB', 7200, true),
('MacBook Air M4 15"', '256GB/16GB', 6800, true),
('MacBook Air M4 15"', '512GB/24GB', 7800, true),
-- MacBook Pro M3
('MacBook Pro M3 14"', '512GB/18GB', 7500, true),
('MacBook Pro M3 14"', '1TB/18GB', 8200, true),
-- MacBook Pro M3 Pro
('MacBook Pro M3 Pro 14"', '512GB/18GB', 8500, true),
('MacBook Pro M3 Pro 14"', '1TB/18GB', 9200, true),
('MacBook Pro M3 Pro 16"', '512GB/18GB', 9500, true),
('MacBook Pro M3 Pro 16"', '1TB/36GB', 10500, true),
-- MacBook Pro M3 Max
('MacBook Pro M3 Max 14"', '1TB/36GB', 12000, true),
('MacBook Pro M3 Max 16"', '1TB/36GB', 13500, true),
-- MacBook Pro M4
('MacBook Pro M4 14"', '512GB/16GB', 8000, true),
('MacBook Pro M4 14"', '1TB/24GB', 9000, true),
-- MacBook Pro M4 Pro
('MacBook Pro M4 Pro 14"', '512GB/24GB', 9500, true),
('MacBook Pro M4 Pro 14"', '1TB/24GB', 10500, true),
('MacBook Pro M4 Pro 16"', '512GB/24GB', 10500, true),
('MacBook Pro M4 Pro 16"', '1TB/48GB', 12000, true),
-- MacBook Pro M4 Max
('MacBook Pro M4 Max 14"', '1TB/36GB', 13000, true),
('MacBook Pro M4 Max 16"', '1TB/36GB', 14500, true),
('MacBook Pro M4 Max 16"', '1TB/48GB', 16000, true)
ON CONFLICT (modelo, armazenamento) DO UPDATE SET valor_base = EXCLUDED.valor_base, ativo = EXCLUDED.ativo, updated_at = now();

-- ── Apple Watch ──

INSERT INTO avaliacao_usados (modelo, armazenamento, valor_base, ativo) VALUES
-- Apple Watch SE 2
('Apple Watch SE 2 40mm', 'GPS', 800, true),
('Apple Watch SE 2 44mm', 'GPS', 900, true),
('Apple Watch SE 2 40mm', 'GPS + Celular', 1000, true),
('Apple Watch SE 2 44mm', 'GPS + Celular', 1100, true),
-- Apple Watch SE 3
('Apple Watch SE 3 42mm', 'GPS', 1200, true),
('Apple Watch SE 3 46mm', 'GPS', 1300, true),
('Apple Watch SE 3 42mm', 'GPS + Celular', 1400, true),
('Apple Watch SE 3 46mm', 'GPS + Celular', 1500, true),
-- Apple Watch Series 9
('Apple Watch Series 9 41mm', 'GPS', 1500, true),
('Apple Watch Series 9 45mm', 'GPS', 1700, true),
('Apple Watch Series 9 41mm', 'GPS + Celular', 1800, true),
('Apple Watch Series 9 45mm', 'GPS + Celular', 2000, true),
-- Apple Watch Series 10
('Apple Watch Series 10 42mm', 'GPS', 1800, true),
('Apple Watch Series 10 46mm', 'GPS', 2100, true),
('Apple Watch Series 10 42mm', 'GPS + Celular', 2200, true),
('Apple Watch Series 10 46mm', 'GPS + Celular', 2500, true),
-- Apple Watch Series 11
('Apple Watch Series 11 42mm', 'GPS', 2200, true),
('Apple Watch Series 11 46mm', 'GPS', 2500, true),
('Apple Watch Series 11 42mm', 'GPS + Celular', 2600, true),
('Apple Watch Series 11 46mm', 'GPS + Celular', 2900, true),
-- Apple Watch Ultra 2
('Apple Watch Ultra 2 49mm', 'GPS + Celular', 3500, true)
ON CONFLICT (modelo, armazenamento) DO UPDATE SET valor_base = EXCLUDED.valor_base, ativo = EXCLUDED.ativo, updated_at = now();

SELECT 'Seed concluido! ' || count(*) || ' modelos cadastrados.' AS resultado FROM avaliacao_usados;
