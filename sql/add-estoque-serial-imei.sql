-- Adicionar Serial No. e IMEI na tabela estoque
-- André: rode isso no SQL Editor do Supabase

ALTER TABLE estoque
  ADD COLUMN IF NOT EXISTS serial_no TEXT,
  ADD COLUMN IF NOT EXISTS imei TEXT;
