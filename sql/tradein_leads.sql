-- Table for exit intent leads (users who tried to leave the trade-in calculator)
CREATE TABLE IF NOT EXISTS tradein_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp TEXT NOT NULL,
  nome TEXT,
  modelo_usado TEXT,
  modelo_novo TEXT,
  valor_cotacao NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tradein_leads ENABLE ROW LEVEL SECURITY;

-- Allow inserts from service role (API route)
CREATE POLICY "Service role can insert leads"
  ON tradein_leads FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow reads from service role
CREATE POLICY "Service role can read leads"
  ON tradein_leads FOR SELECT
  TO service_role
  USING (true);
