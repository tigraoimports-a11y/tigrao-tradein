CREATE TABLE IF NOT EXISTS scan_sessions (
  token      TEXT PRIMARY KEY,
  serial     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '10 minutes'
);
