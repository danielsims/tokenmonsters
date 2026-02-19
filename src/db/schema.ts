import { Database } from "bun:sqlite";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rarity TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','legendary')),
  base_hunger_rate REAL NOT NULL,
  base_happiness_rate REAL NOT NULL,
  evolution_thresholds TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monsters (
  id TEXT PRIMARY KEY,
  name TEXT,
  species_id TEXT NOT NULL,
  genome BLOB NOT NULL,
  stage TEXT NOT NULL DEFAULT 'egg' CHECK(stage IN ('egg','hatchling','juvenile','adult','elder')),
  hunger INTEGER NOT NULL DEFAULT 100 CHECK(hunger BETWEEN 0 AND 100),
  happiness INTEGER NOT NULL DEFAULT 100 CHECK(happiness BETWEEN 0 AND 100),
  energy INTEGER NOT NULL DEFAULT 100 CHECK(energy BETWEEN 0 AND 100),
  experience INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  hatched_at INTEGER,
  last_fed_at INTEGER,
  last_interaction_at INTEGER,
  evolved_at INTEGER,
  checksum TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'generated' CHECK(origin IN ('generated','gifted')),
  origin_from TEXT,
  FOREIGN KEY (species_id) REFERENCES species(id)
);

CREATE TABLE IF NOT EXISTS token_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id TEXT NOT NULL,
  source TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_tokens INTEGER NOT NULL DEFAULT 0,
  fed_at INTEGER NOT NULL,
  FOREIGN KEY (monster_id) REFERENCES monsters(id)
);

CREATE TABLE IF NOT EXISTS evolution_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  evolved_at INTEGER NOT NULL,
  trigger_reason TEXT NOT NULL,
  tokens_at_evolution INTEGER NOT NULL,
  FOREIGN KEY (monster_id) REFERENCES monsters(id)
);
`;

export function applySchema(db: Database): void {
  db.exec(SCHEMA_SQL);
}
