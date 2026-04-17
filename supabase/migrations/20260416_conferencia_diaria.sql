-- Tabela de conferencia diaria: valores preenchidos MANUALMENTE pelo operador
-- pra comparar com o que o sistema calcula. Uma linha por dia.
-- Negativos em especie representam deposito interno e sao IGNORADOS no total.

CREATE TABLE IF NOT EXISTS conferencia_diaria (
  data DATE PRIMARY KEY,
  itau_pix NUMERIC(12,2) NOT NULL DEFAULT 0,
  itau_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
  infinite_pix NUMERIC(12,2) NOT NULL DEFAULT 0,
  infinite_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
  infinite_debito NUMERIC(12,2) NOT NULL DEFAULT 0,
  mp_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
  mp_pix NUMERIC(12,2) NOT NULL DEFAULT 0,
  especie NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacao TEXT,
  preenchido_por TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conferencia_diaria_data ON conferencia_diaria(data DESC);

-- Grants (admin API usa service role, mas garantimos que a tabela existe)
GRANT SELECT, INSERT, UPDATE, DELETE ON conferencia_diaria TO service_role;

-- Seed: valores de marco/2026 que o Nicolas ja tem mapeados.
-- ON CONFLICT DO NOTHING pra nao sobrescrever se ja foram preenchidos depois.
INSERT INTO conferencia_diaria (data, itau_pix, itau_credito, infinite_pix, infinite_credito, infinite_debito, mp_credito, mp_pix, especie, preenchido_por) VALUES
  ('2026-03-01', 0.00, 0.00, 0.00, 0.00, 0.00, 10515.96, 0.00, 0.00, 'seed'),
  ('2026-03-02', 71551.97, 0.00, 6897.00, 0.00, 0.00, 13480.03, 2400.00, 0.00, 'seed'),
  ('2026-03-03', 7325.00, 6295.32, 16497.00, 12869.73, 0.00, 4705.19, 0.00, 0.00, 'seed'),
  ('2026-03-04', 66577.90, 18368.18, 0.00, 18909.32, 2842.54, 7903.31, 0.00, 0.00, 'seed'),
  ('2026-03-05', 63237.00, 9101.08, 3000.00, 48938.97, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-06', 44330.00, 13218.82, 3997.00, 17509.05, 0.00, 16162.87, 0.00, 0.00, 'seed'),
  ('2026-03-07', 59341.00, 0.00, 7348.40, 0.00, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-08', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-09', 72415.00, 45815.50, 10197.00, 59595.93, 0.00, 0.00, 11990.00, 0.00, 'seed'),
  ('2026-03-10', 41420.00, 3921.78, 5197.00, 28353.17, 0.00, 4663.95, 0.00, 0.00, 'seed'),
  ('2026-03-11', 54732.44, 11662.76, 8010.00, 5959.55, 0.00, 20225.12, 0.00, 0.00, 'seed'),
  ('2026-03-12', 89904.00, 5155.79, 0.00, 27729.41, 0.00, 2001.94, 0.00, 0.00, 'seed'),
  ('2026-03-13', 85078.00, 2986.80, 6793.00, 12138.28, 0.00, 11210.45, 0.00, 0.00, 'seed'),
  ('2026-03-14', 13044.00, 0.00, 0.00, 0.00, 0.00, 8156.72, 0.00, 0.00, 'seed'),
  ('2026-03-15', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-16', 20137.00, 13070.07, 4000.00, 13660.24, 2676.77, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-17', 40312.00, 6339.82, 11794.00, 32883.24, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-18', 47894.00, 4276.36, 6000.00, 23145.00, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-19', 87565.00, 2168.99, 0.00, 15611.67, 0.00, 0.00, 0.00, 3900.00, 'seed'),
  ('2026-03-20', 77308.00, 4021.92, 4697.00, 0.00, 0.00, 2998.72, 0.00, 4300.00, 'seed'),
  ('2026-03-21', 32599.00, 0.00, 6594.00, 0.00, 0.00, 9511.44, 0.00, 0.00, 'seed'),
  ('2026-03-22', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-23', 69965.00, 27460.53, 7097.00, 29028.05, 0.00, 2701.47, 0.00, 0.00, 'seed'),
  ('2026-03-24', 32646.56, 8243.69, 5397.00, 25530.10, 0.00, 0.00, 0.00, 8000.00, 'seed'),
  ('2026-03-25', 0.00, 9069.96, 0.00, 9141.05, 0.00, 7607.03, 0.00, 0.00, 'seed'),
  ('2026-03-26', 86893.00, 3946.85, 5500.00, 5523.42, 0.00, 9309.30, 0.00, 5200.00, 'seed'),
  ('2026-03-27', 33890.00, 6595.86, 5100.00, 14546.00, 3967.02, 15023.00, 0.00, 0.00, 'seed'),
  ('2026-03-28', 69274.00, 0.00, 38483.00, 0.00, 0.00, 0.00, 0.00, -21400.00, 'seed'),
  ('2026-03-29', 8800.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'seed'),
  ('2026-03-30', 44744.00, 4449.94, 9497.00, 36230.64, 0.00, 3905.47, 0.00, 200.00, 'seed'),
  ('2026-03-31', 73372.00, 7001.10, 0.00, 29985.25, 6249.57, 6811.06, 0.00, 9800.00, 'seed')
ON CONFLICT (data) DO NOTHING;
