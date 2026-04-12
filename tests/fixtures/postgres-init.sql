-- Schema and seed data for the postgres-crm-pipeline cookbook recipe.
-- Used by tests/docker-compose.yml to bootstrap the test database.

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  company TEXT,
  score INTEGER,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_scores (
  lead_id TEXT,
  score INTEGER,
  tier TEXT,
  scored_at TIMESTAMPTZ
);

-- Seed: three unscored leads for the graph to process
INSERT INTO leads (id, email, company) VALUES
  ('lead-001', 'alice@acme.com', 'Acme Corp'),
  ('lead-002', 'bob@globex.io', 'Globex Inc'),
  ('lead-003', 'carol@initech.co', 'Initech')
ON CONFLICT (id) DO NOTHING;
