import { getDatabase } from "./database";
import { signMonster, verifyMonster } from "../models/integrity";
import type {
  Monster,
  Species,
  TokenFeed,
  EvolutionRecord,
  Stage,
  TokenSource,
} from "../models/types";

// --- Species ---

export function getAllSpecies(): Species[] {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM species").all() as any[];
  return rows.map(rowToSpecies);
}

export function getSpeciesById(id: number): Species | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM species WHERE id = ?").get(id) as any;
  return row ? rowToSpecies(row) : null;
}

function rowToSpecies(row: any): Species {
  return {
    id: Number(row.id),
    description: row.description,
    rarity: row.rarity,
    baseHungerRate: row.base_hunger_rate,
    baseHappinessRate: row.base_happiness_rate,
    forms: JSON.parse(row.forms),
  };
}

export function getOwnedSpeciesIds(): Set<number> {
  const db = getDatabase();
  const rows = db.query("SELECT DISTINCT species_id FROM monsters").all() as any[];
  return new Set(rows.map((r) => r.species_id));
}

/** Returns the highest evolution stage reached per species */
export function getOwnedSpeciesStages(): Map<number, Stage> {
  const db = getDatabase();
  const rows = db.query("SELECT species_id, stage FROM monsters WHERE mint_address IS NOT NULL").all() as any[];
  const order: Stage[] = ["egg", "hatchling", "prime", "apex"];
  const map = new Map<number, Stage>();
  for (const row of rows) {
    const current = map.get(row.species_id);
    if (!current || order.indexOf(row.stage as Stage) > order.indexOf(current)) {
      map.set(row.species_id, row.stage as Stage);
    }
  }
  return map;
}

// --- Monsters ---

export const PARTY_MAX = 10;

export function getMonster(id: string): Monster | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM monsters WHERE id = ?").get(id) as any;
  return row ? rowToMonster(row) : null;
}

export function getAllMonsters(): Monster[] {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM monsters ORDER BY created_at ASC").all() as any[];
  return rows.map(rowToMonster);
}

export function getActiveMonster(): Monster | null {
  const db = getDatabase();
  // Check for explicitly set active monster first
  const activeId = getSetting("active_monster_id");
  if (activeId) {
    const row = db.query("SELECT * FROM monsters WHERE id = ?").get(activeId) as any;
    if (row) return rowToMonster(row);
  }
  // Fall back to newest monster
  const row = db.query("SELECT * FROM monsters ORDER BY created_at DESC LIMIT 1").get() as any;
  return row ? rowToMonster(row) : null;
}

export function setActiveMonster(id: string): void {
  setSetting("active_monster_id", id);
}

export function getMonsterCount(): number {
  const db = getDatabase();
  const result = db.query("SELECT COUNT(*) as count FROM monsters").get() as { count: number };
  return result.count;
}

export function createMonster(monster: Omit<Monster, "checksum" | "tampered">): Monster | null {
  if (getMonsterCount() >= PARTY_MAX) return null;
  const db = getDatabase();
  const checksum = signMonster(monster);
  const full: Monster = { ...monster, checksum, tampered: false };

  db.query(
    `INSERT INTO monsters (id, name, species_id, genome, stage, hunger, happiness, energy, experience, created_at, hatched_at, last_fed_at, last_interaction_at, evolved_at, checksum, origin, origin_from, mint_address, mint_network, claimed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    full.id,
    full.name,
    full.speciesId,
    full.genome,
    full.stage,
    full.hunger,
    full.happiness,
    full.energy,
    full.experience,
    full.createdAt,
    full.hatchedAt,
    full.lastFedAt,
    full.lastInteractionAt,
    full.evolvedAt,
    full.checksum,
    full.origin,
    full.originFrom,
    full.mintAddress,
    full.mintNetwork,
    full.claimedBy
  );

  return full;
}

export function updateMonster(monster: Monster): Monster {
  const db = getDatabase();
  const checksum = signMonster(monster);
  const updated: Monster = { ...monster, checksum };

  db.query(
    `UPDATE monsters SET
      name = ?, stage = ?, hunger = ?, happiness = ?, energy = ?, experience = ?,
      hatched_at = ?, last_fed_at = ?, last_interaction_at = ?, evolved_at = ?, checksum = ?
     WHERE id = ?`
  ).run(
    updated.name,
    updated.stage,
    updated.hunger,
    updated.happiness,
    updated.energy,
    updated.experience,
    updated.hatchedAt,
    updated.lastFedAt,
    updated.lastInteractionAt,
    updated.evolvedAt,
    updated.checksum,
    updated.id
  );

  return updated;
}

function rowToMonster(row: any): Monster {
  const monster: Monster = {
    id: row.id,
    name: row.name,
    speciesId: row.species_id,
    genome: Buffer.isBuffer(row.genome) ? row.genome : Buffer.from(row.genome),
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
    checksum: row.checksum,
    origin: row.origin,
    originFrom: row.origin_from,
    mintAddress: row.mint_address ?? null,
    mintNetwork: row.mint_network ?? null,
    claimedBy: row.claimed_by ?? null,
    tampered: false,
  };
  monster.tampered = !verifyMonster(monster);
  return monster;
}

export function isAlreadyClaimed(mintAddress: string): boolean {
  const db = getDatabase();
  const row = db.query("SELECT 1 FROM monsters WHERE mint_address = ? LIMIT 1").get(mintAddress);
  return !!row;
}

export function resolveSpeciesByEggName(eggName: string): Species | null {
  const all = getAllSpecies();
  for (const sp of all) {
    const eggForm = sp.forms.find((f) => f.stage === "egg");
    if (eggForm && eggForm.name.toLowerCase() === eggName.toLowerCase()) {
      return sp;
    }
  }
  return null;
}

// --- Token Feeds ---

export function recordTokenFeed(feed: Omit<TokenFeed, "id">): TokenFeed {
  const db = getDatabase();
  const result = db.query(
    `INSERT INTO token_feeds (monster_id, source, input_tokens, output_tokens, cache_tokens, fed_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    feed.monsterId,
    feed.source,
    feed.inputTokens,
    feed.outputTokens,
    feed.cacheTokens,
    feed.fedAt
  ) as any;

  return {
    id: result.id,
    monsterId: result.monster_id,
    source: result.source,
    inputTokens: result.input_tokens,
    outputTokens: result.output_tokens,
    cacheTokens: result.cache_tokens,
    fedAt: result.fed_at,
  };
}

export function getRecentFeeds(monsterId: string, limit = 20): TokenFeed[] {
  const db = getDatabase();
  const rows = db.query(
    `SELECT * FROM token_feeds WHERE monster_id = ? ORDER BY fed_at DESC LIMIT ?`
  ).all(monsterId, limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    monsterId: r.monster_id,
    source: r.source as TokenSource,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheTokens: r.cache_tokens,
    fedAt: r.fed_at,
  }));
}

export function getTotalTokensBySource(monsterId: string): Record<TokenSource, number> {
  const db = getDatabase();
  const rows = db.query(
    `SELECT source, SUM(input_tokens + output_tokens + cache_tokens) as total
     FROM token_feeds WHERE monster_id = ? GROUP BY source`
  ).all(monsterId) as any[];

  const result: Record<TokenSource, number> = { claude: 0, codex: 0, opencode: 0 };
  for (const row of rows) {
    result[row.source as TokenSource] = row.total;
  }
  return result;
}

// --- Evolution History ---

export function recordEvolution(record: Omit<EvolutionRecord, "id">): EvolutionRecord {
  const db = getDatabase();
  const result = db.query(
    `INSERT INTO evolution_history (monster_id, from_stage, to_stage, evolved_at, trigger_reason, tokens_at_evolution)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    record.monsterId,
    record.fromStage,
    record.toStage,
    record.evolvedAt,
    record.triggerReason,
    record.tokensAtEvolution
  ) as any;

  return {
    id: result.id,
    monsterId: result.monster_id,
    fromStage: result.from_stage,
    toStage: result.to_stage,
    evolvedAt: result.evolved_at,
    triggerReason: result.trigger_reason,
    tokensAtEvolution: result.tokens_at_evolution,
  };
}

// --- Settings ---

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const db = getDatabase();
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// --- Evolution History ---

export function getEvolutionHistory(monsterId: string): EvolutionRecord[] {
  const db = getDatabase();
  const rows = db.query(
    `SELECT * FROM evolution_history WHERE monster_id = ? ORDER BY evolved_at ASC`
  ).all(monsterId) as any[];

  return rows.map((r) => ({
    id: r.id,
    monsterId: r.monster_id,
    fromStage: r.from_stage as Stage,
    toStage: r.to_stage as Stage,
    evolvedAt: r.evolved_at,
    triggerReason: r.trigger_reason,
    tokensAtEvolution: r.tokens_at_evolution,
  }));
}
