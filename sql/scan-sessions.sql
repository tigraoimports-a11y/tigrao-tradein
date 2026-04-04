-- Sessões temporárias para scanner remoto via iPhone
-- Rodar no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS scan_sessions (
  token      TEXT PRIMARY KEY,
  serial     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '10 minutes'
);

-- Limpeza automática de sessões expiradas (opcional)
CREATE INDEX IF NOT EXISTS scan_sessions_expires_idx ON scan_sessions (expires_at);
