-- Campo garantia no estoque (texto livre: DD/MM/AAAA ou MM/AAAA)
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS garantia TEXT DEFAULT NULL;
