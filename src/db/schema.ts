import { Database } from "bun:sqlite";
import type { Stage, Origin } from "../models/types";
import { signMonster } from "../models/integrity";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY,
  description TEXT,
  rarity TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','legendary')),
  base_hunger_rate REAL NOT NULL,
  base_happiness_rate REAL NOT NULL,
  forms TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monsters (
  id TEXT PRIMARY KEY,
  name TEXT,
  species_id INTEGER NOT NULL,
  genome BLOB NOT NULL,
  stage TEXT NOT NULL DEFAULT 'egg' CHECK(stage IN ('egg','hatchling','prime','apex')),
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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function applySchema(db: Database): void {
  db.exec(SCHEMA_SQL);
  applyMigrations(db);
}

/** Run additive migrations that ALTER existing tables */
function applyMigrations(db: Database): void {
  // Add mint columns to monsters table (blockchain integration)
  const cols = db.query("PRAGMA table_info(monsters)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has("mint_address")) {
    db.exec("ALTER TABLE monsters ADD COLUMN mint_address TEXT");
  }
  if (!colNames.has("mint_network")) {
    db.exec("ALTER TABLE monsters ADD COLUMN mint_network TEXT");
  }
  if (!colNames.has("claimed_by")) {
    db.exec("ALTER TABLE monsters ADD COLUMN claimed_by TEXT");
  }

  // Expand origin CHECK constraint to allow 'minted'
  // SQLite doesn't support ALTER CHECK, so we rebuild the table
  const tableInfo = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='monsters'").get() as { sql: string } | null;
  if (tableInfo?.sql && !tableInfo.sql.includes("'minted'")) {
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec(`CREATE TABLE monsters_new (
      id TEXT PRIMARY KEY,
      name TEXT,
      species_id INTEGER NOT NULL,
      genome BLOB NOT NULL,
      stage TEXT NOT NULL DEFAULT 'egg' CHECK(stage IN ('egg','hatchling','prime','apex')),
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
      origin TEXT NOT NULL DEFAULT 'generated' CHECK(origin IN ('generated','gifted','minted')),
      origin_from TEXT,
      mint_address TEXT,
      mint_network TEXT,
      claimed_by TEXT,
      FOREIGN KEY (species_id) REFERENCES species(id)
    )`);
    db.exec("INSERT INTO monsters_new SELECT id, name, species_id, genome, stage, hunger, happiness, energy, experience, created_at, hatched_at, last_fed_at, last_interaction_at, evolved_at, checksum, origin, origin_from, mint_address, mint_network, claimed_by FROM monsters");
    db.exec("DROP TABLE monsters");
    db.exec("ALTER TABLE monsters_new RENAME TO monsters");
    db.exec("PRAGMA foreign_keys=ON");
  }

  // Re-sign all monsters with expanded checksum fields (v2: includes mintAddress, mintNetwork, claimedBy)
  // Uses a settings flag to avoid re-running on every startup
  const checksumVersion = db.query("SELECT value FROM settings WHERE key = 'checksum_version'").get() as { value: string } | null;
  if (!checksumVersion || Number(checksumVersion.value) < 2) {
    const monsters = db.query("SELECT * FROM monsters").all() as any[];
    const update = db.query("UPDATE monsters SET checksum = ? WHERE id = ?");
    for (const row of monsters) {
      const genome = Buffer.isBuffer(row.genome) ? row.genome : Buffer.from(row.genome);
      const checksum = signMonster({
        id: row.id,
        name: row.name,
        speciesId: row.species_id,
        genome,
        stage: row.stage as Stage,
        hunger: row.hunger,
        happiness: row.happiness,
        energy: row.energy,
        experience: row.experience,
        createdAt: row.created_at,
        hatchedAt: row.hatched_at,
        lastFedAt: row.last_fed_at,
        lastInteractionAt: row.last_interaction_at,
        evolvedAt: row.evolved_at,
        origin: row.origin as Origin,
        originFrom: row.origin_from,
      });
      update.run(checksum, row.id);
    }
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES ('checksum_version', '2')").run();
  }

  // v3: Remove crypto — nullify mint columns, convert 'minted' origin to 'generated', re-sign
  if (!checksumVersion || Number(checksumVersion.value) < 3) {
    db.exec("UPDATE monsters SET mint_address = NULL, mint_network = NULL, claimed_by = NULL");
    db.exec("UPDATE monsters SET origin = 'generated' WHERE origin = 'minted'");

    const monsters = db.query("SELECT * FROM monsters").all() as any[];
    const update = db.query("UPDATE monsters SET checksum = ? WHERE id = ?");
    for (const row of monsters) {
      const genome = Buffer.isBuffer(row.genome) ? row.genome : Buffer.from(row.genome);
      const checksum = signMonster({
        id: row.id,
        name: row.name,
        speciesId: row.species_id,
        genome,
        stage: row.stage as Stage,
        hunger: row.hunger,
        happiness: row.happiness,
        energy: row.energy,
        experience: row.experience,
        createdAt: row.created_at,
        hatchedAt: row.hatched_at,
        lastFedAt: row.last_fed_at,
        lastInteractionAt: row.last_interaction_at,
        evolvedAt: row.evolved_at,
        origin: (row.origin === "minted" ? "generated" : row.origin) as Origin,
        originFrom: row.origin_from,
      });
      update.run(checksum, row.id);
    }
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES ('checksum_version', '3')").run();
  }
}
