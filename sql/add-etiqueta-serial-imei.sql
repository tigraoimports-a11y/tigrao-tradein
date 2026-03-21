-- Adicionar Serial No. e IMEI na tabela etiquetas
-- André: rode isso no SQL Editor do Supabase

ALTER TABLE etiquetas
  ADD COLUMN IF NOT EXISTS serial_no TEXT,
  ADD COLUMN IF NOT EXISTS imei TEXT;
