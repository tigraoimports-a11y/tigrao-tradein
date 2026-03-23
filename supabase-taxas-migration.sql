-- ============================================
-- Migration: taxas_config table
-- Taxas das maquininhas — TigraoImports
-- ============================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS taxas_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  banco TEXT NOT NULL,
  bandeira TEXT NOT NULL,
  parcelas TEXT NOT NULL,
  taxa_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'sistema',
  UNIQUE(banco, bandeira, parcelas)
);

-- 2. Disable RLS
ALTER TABLE taxas_config DISABLE ROW LEVEL SECURITY;

-- 3. Grant access
GRANT ALL ON taxas_config TO anon, authenticated, service_role;

-- 4. Seed data

-- ── ITAU — VISA ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('ITAU', 'VISA', 'debito', 1.09, 'migration'),
  ('ITAU', 'VISA', '1x', 3.57, 'migration'),
  ('ITAU', 'VISA', '2x', 4.06, 'migration'),
  ('ITAU', 'VISA', '3x', 5.57, 'migration'),
  ('ITAU', 'VISA', '6x', 7.56, 'migration'),
  ('ITAU', 'VISA', '12x', 10.03, 'migration'),
  ('ITAU', 'VISA', '18x', 13.49, 'migration'),
  ('ITAU', 'VISA', '21x', 15.34, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── ITAU — MASTERCARD (same as VISA) ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('ITAU', 'MASTERCARD', 'debito', 1.09, 'migration'),
  ('ITAU', 'MASTERCARD', '1x', 3.57, 'migration'),
  ('ITAU', 'MASTERCARD', '2x', 4.06, 'migration'),
  ('ITAU', 'MASTERCARD', '3x', 5.57, 'migration'),
  ('ITAU', 'MASTERCARD', '6x', 7.56, 'migration'),
  ('ITAU', 'MASTERCARD', '12x', 10.03, 'migration'),
  ('ITAU', 'MASTERCARD', '18x', 13.49, 'migration'),
  ('ITAU', 'MASTERCARD', '21x', 15.34, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── ITAU — ELO ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('ITAU', 'ELO', 'debito', 1.89, 'migration'),
  ('ITAU', 'ELO', '1x', 4.37, 'migration'),
  ('ITAU', 'ELO', '2x', 4.86, 'migration'),
  ('ITAU', 'ELO', '3x', 5.97, 'migration'),
  ('ITAU', 'ELO', '6x', 7.96, 'migration'),
  ('ITAU', 'ELO', '12x', 10.83, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── ITAU — AMEX (same as ELO) ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('ITAU', 'AMEX', 'debito', 1.89, 'migration'),
  ('ITAU', 'AMEX', '1x', 4.37, 'migration'),
  ('ITAU', 'AMEX', '2x', 4.86, 'migration'),
  ('ITAU', 'AMEX', '3x', 5.97, 'migration'),
  ('ITAU', 'AMEX', '6x', 7.96, 'migration'),
  ('ITAU', 'AMEX', '12x', 10.83, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── INFINITE — VISA ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('INFINITE', 'VISA', 'debito', 0.75, 'migration'),
  ('INFINITE', 'VISA', '1x', 2.69, 'migration'),
  ('INFINITE', 'VISA', '2x', 3.94, 'migration'),
  ('INFINITE', 'VISA', '3x', 4.46, 'migration'),
  ('INFINITE', 'VISA', '4x', 4.98, 'migration'),
  ('INFINITE', 'VISA', '5x', 5.49, 'migration'),
  ('INFINITE', 'VISA', '6x', 5.99, 'migration'),
  ('INFINITE', 'VISA', '7x', 6.51, 'migration'),
  ('INFINITE', 'VISA', '8x', 6.99, 'migration'),
  ('INFINITE', 'VISA', '9x', 7.51, 'migration'),
  ('INFINITE', 'VISA', '10x', 7.99, 'migration'),
  ('INFINITE', 'VISA', '11x', 8.49, 'migration'),
  ('INFINITE', 'VISA', '12x', 8.99, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── INFINITE — MASTERCARD (same as VISA) ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('INFINITE', 'MASTERCARD', 'debito', 0.75, 'migration'),
  ('INFINITE', 'MASTERCARD', '1x', 2.69, 'migration'),
  ('INFINITE', 'MASTERCARD', '2x', 3.94, 'migration'),
  ('INFINITE', 'MASTERCARD', '3x', 4.46, 'migration'),
  ('INFINITE', 'MASTERCARD', '4x', 4.98, 'migration'),
  ('INFINITE', 'MASTERCARD', '5x', 5.49, 'migration'),
  ('INFINITE', 'MASTERCARD', '6x', 5.99, 'migration'),
  ('INFINITE', 'MASTERCARD', '7x', 6.51, 'migration'),
  ('INFINITE', 'MASTERCARD', '8x', 6.99, 'migration'),
  ('INFINITE', 'MASTERCARD', '9x', 7.51, 'migration'),
  ('INFINITE', 'MASTERCARD', '10x', 7.99, 'migration'),
  ('INFINITE', 'MASTERCARD', '11x', 8.49, 'migration'),
  ('INFINITE', 'MASTERCARD', '12x', 8.99, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── INFINITE — ELO ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('INFINITE', 'ELO', 'debito', 1.88, 'migration'),
  ('INFINITE', 'ELO', '1x', 4.46, 'migration'),
  ('INFINITE', 'ELO', '2x', 5.08, 'migration'),
  ('INFINITE', 'ELO', '3x', 5.71, 'migration'),
  ('INFINITE', 'ELO', '4x', 6.34, 'migration'),
  ('INFINITE', 'ELO', '5x', 6.46, 'migration'),
  ('INFINITE', 'ELO', '6x', 7.09, 'migration'),
  ('INFINITE', 'ELO', '7x', 7.71, 'migration'),
  ('INFINITE', 'ELO', '8x', 8.34, 'migration'),
  ('INFINITE', 'ELO', '9x', 8.96, 'migration'),
  ('INFINITE', 'ELO', '10x', 9.59, 'migration'),
  ('INFINITE', 'ELO', '11x', 10.21, 'migration'),
  ('INFINITE', 'ELO', '12x', 10.77, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── INFINITE — AMEX (same as ELO) ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('INFINITE', 'AMEX', 'debito', 1.88, 'migration'),
  ('INFINITE', 'AMEX', '1x', 4.46, 'migration'),
  ('INFINITE', 'AMEX', '2x', 5.08, 'migration'),
  ('INFINITE', 'AMEX', '3x', 5.71, 'migration'),
  ('INFINITE', 'AMEX', '4x', 6.34, 'migration'),
  ('INFINITE', 'AMEX', '5x', 6.46, 'migration'),
  ('INFINITE', 'AMEX', '6x', 7.09, 'migration'),
  ('INFINITE', 'AMEX', '7x', 7.71, 'migration'),
  ('INFINITE', 'AMEX', '8x', 8.34, 'migration'),
  ('INFINITE', 'AMEX', '9x', 8.96, 'migration'),
  ('INFINITE', 'AMEX', '10x', 9.59, 'migration'),
  ('INFINITE', 'AMEX', '11x', 10.21, 'migration'),
  ('INFINITE', 'AMEX', '12x', 10.77, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- ── MERCADO_PAGO — ALL (single bandeira) ──
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_by) VALUES
  ('MERCADO_PAGO', 'ALL', 'pix', 0.00, 'migration'),
  ('MERCADO_PAGO', 'ALL', 'debito', 0.00, 'migration'),
  ('MERCADO_PAGO', 'ALL', '1x', 3.25, 'migration'),
  ('MERCADO_PAGO', 'ALL', '2x', 3.80, 'migration'),
  ('MERCADO_PAGO', 'ALL', '3x', 4.55, 'migration'),
  ('MERCADO_PAGO', 'ALL', '4x', 5.30, 'migration'),
  ('MERCADO_PAGO', 'ALL', '5x', 6.05, 'migration'),
  ('MERCADO_PAGO', 'ALL', '6x', 6.80, 'migration'),
  ('MERCADO_PAGO', 'ALL', '7x', 7.55, 'migration'),
  ('MERCADO_PAGO', 'ALL', '8x', 8.30, 'migration'),
  ('MERCADO_PAGO', 'ALL', '9x', 9.05, 'migration'),
  ('MERCADO_PAGO', 'ALL', '10x', 9.80, 'migration'),
  ('MERCADO_PAGO', 'ALL', '11x', 10.55, 'migration'),
  ('MERCADO_PAGO', 'ALL', '12x', 11.34, 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, updated_at = NOW();

-- 5. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_taxas_config_banco ON taxas_config(banco);
CREATE INDEX IF NOT EXISTS idx_taxas_config_lookup ON taxas_config(banco, bandeira, parcelas);
