CREATE TABLE IF NOT EXISTS hocuspocus_documents (
  name TEXT PRIMARY KEY,
  state BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hocuspocus_documents_updated_at
  ON hocuspocus_documents (updated_at DESC);
