-- ============================================================
-- Fill missing Itau parcelas (4x,5x,7x-11x,13x-17x,19x,20x)
-- Values interpolated linearly between existing rates.
-- ============================================================

-- VISA: existing anchors: 3x=5.57, 6x=7.56, 12x=10.03, 18x=13.49, 21x=15.34
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_at, updated_by) VALUES
  ('ITAU', 'VISA', '4x',  6.23, NOW(), 'migration'),
  ('ITAU', 'VISA', '5x',  6.90, NOW(), 'migration'),
  ('ITAU', 'VISA', '7x',  7.97, NOW(), 'migration'),
  ('ITAU', 'VISA', '8x',  8.38, NOW(), 'migration'),
  ('ITAU', 'VISA', '9x',  8.80, NOW(), 'migration'),
  ('ITAU', 'VISA', '10x', 9.21, NOW(), 'migration'),
  ('ITAU', 'VISA', '11x', 9.62, NOW(), 'migration'),
  ('ITAU', 'VISA', '13x', 10.61, NOW(), 'migration'),
  ('ITAU', 'VISA', '14x', 11.18, NOW(), 'migration'),
  ('ITAU', 'VISA', '15x', 11.76, NOW(), 'migration'),
  ('ITAU', 'VISA', '16x', 12.34, NOW(), 'migration'),
  ('ITAU', 'VISA', '17x', 12.91, NOW(), 'migration'),
  ('ITAU', 'VISA', '19x', 14.11, NOW(), 'migration'),
  ('ITAU', 'VISA', '20x', 14.72, NOW(), 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO NOTHING;

-- MASTERCARD: same rates as VISA
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_at, updated_by) VALUES
  ('ITAU', 'MASTERCARD', '4x',  6.23, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '5x',  6.90, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '7x',  7.97, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '8x',  8.38, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '9x',  8.80, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '10x', 9.21, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '11x', 9.62, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '13x', 10.61, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '14x', 11.18, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '15x', 11.76, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '16x', 12.34, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '17x', 12.91, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '19x', 14.11, NOW(), 'migration'),
  ('ITAU', 'MASTERCARD', '20x', 14.72, NOW(), 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO NOTHING;

-- ELO: existing anchors: 3x=5.97, 6x=7.96, 12x=10.83 (max 12x)
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_at, updated_by) VALUES
  ('ITAU', 'ELO', '4x',  6.63, NOW(), 'migration'),
  ('ITAU', 'ELO', '5x',  7.30, NOW(), 'migration'),
  ('ITAU', 'ELO', '7x',  8.44, NOW(), 'migration'),
  ('ITAU', 'ELO', '8x',  8.92, NOW(), 'migration'),
  ('ITAU', 'ELO', '9x',  9.39, NOW(), 'migration'),
  ('ITAU', 'ELO', '10x', 9.87, NOW(), 'migration'),
  ('ITAU', 'ELO', '11x', 10.35, NOW(), 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO NOTHING;

-- AMEX: same rates as ELO (max 12x)
INSERT INTO taxas_config (banco, bandeira, parcelas, taxa_pct, updated_at, updated_by) VALUES
  ('ITAU', 'AMEX', '4x',  6.63, NOW(), 'migration'),
  ('ITAU', 'AMEX', '5x',  7.30, NOW(), 'migration'),
  ('ITAU', 'AMEX', '7x',  8.44, NOW(), 'migration'),
  ('ITAU', 'AMEX', '8x',  8.92, NOW(), 'migration'),
  ('ITAU', 'AMEX', '9x',  9.39, NOW(), 'migration'),
  ('ITAU', 'AMEX', '10x', 9.87, NOW(), 'migration'),
  ('ITAU', 'AMEX', '11x', 10.35, NOW(), 'migration')
ON CONFLICT (banco, bandeira, parcelas) DO NOTHING;
