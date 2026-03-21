-- Add tema column to mostruario_config
-- Default: 'tigrao' (classic orange theme)
ALTER TABLE mostruario_config ADD COLUMN IF NOT EXISTS tema TEXT DEFAULT 'tigrao';
