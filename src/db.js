import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 8,
});

export const q = (text, params) => pool.query(text, params);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  headline      TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT 'Anonymous Citizen',
  desk          TEXT NOT NULL DEFAULT 'general',
  status        TEXT NOT NULL DEFAULT 'pending',
  ups           INTEGER NOT NULL DEFAULT 0,
  downs         INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  report_count  INTEGER NOT NULL DEFAULT 0,
  -- Reality Check: readers assert this has already happened, with a source.
  reality_count INTEGER NOT NULL DEFAULT 0,
  overtaken_at  TIMESTAMPTZ,
  -- Plausibility Index: running sum + n, so the average is cheap.
  plaus_sum     INTEGER NOT NULL DEFAULT 0,
  plaus_n       INTEGER NOT NULL DEFAULT 0,
  submitter     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Scheduled release: a live post stays hidden from the public until
  -- this moment. Defaults to NOW(), so anything approved normally is
  -- visible immediately and the column is invisible unless you use it.
  publish_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_status_created ON posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_status_publish ON posts (status, publish_at);
CREATE INDEX IF NOT EXISTS posts_overtaken ON posts (overtaken_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS votes (
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter      TEXT NOT NULL,
  value      SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, voter)
);

CREATE TABLE IF NOT EXISTS reality_checks (
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter      TEXT NOT NULL,
  source_url TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, voter)
);

CREATE TABLE IF NOT EXISTS plausibility (
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  voter      TEXT NOT NULL,
  score      SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, voter)
);

CREATE TABLE IF NOT EXISTS comments (
  id         BIGSERIAL PRIMARY KEY,
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author     TEXT NOT NULL DEFAULT 'Anonymous Citizen',
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'live',
  submitter  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_post ON comments (post_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id         BIGSERIAL PRIMARY KEY,
  post_id    BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL DEFAULT '',
  reporter   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function migrate() {
  await q(SCHEMA);
  // Additive migrations for databases created before a column existed.
  // IF NOT EXISTS makes each one safe to run on every boot.
  await q(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  console.log('[db] schema ready');
}

/**
 * Load seed.json on first boot only.
 *
 * Runs when the posts table is completely empty, so it fires once on a
 * fresh database and never again — it cannot overwrite or duplicate
 * anything you publish later. This exists so you never need shell access
 * on the host just to get your starting content in.
 */
export async function autoSeed(loadSeedFile) {
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM posts');
  if (rows[0].n > 0) return;
  try {
    const added = await loadSeedFile();
    if (added) console.log(`[db] first boot — seeded ${added} proposal(s) from seed.json`);
  } catch (e) {
    console.warn('[db] auto-seed skipped:', e.message);
  }
}
