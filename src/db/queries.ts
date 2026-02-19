import { getDatabase } from "./database";
import { signMonster, verifyMonster } from "../models/integrity";
import type {
  Monster,
  Species,
  TokenFeed,
  EvolutionRecord,
  Stage,
  TokenSource,
  EvolutionThresholds,
} from "../models/types";

// --- Species ---

export function getAllSpecies(): Species[] {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM species").all() as any[];
  return rows.map(rowToSpecies);
}

export function getSpeciesById(id: string): Species | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM species WHERE id = ?").get(id) as any;
  return row ? rowToSpecies(row) : null;
}

function rowToSpecies(row: any): Species {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rarity: row.rarity,
    baseHungerRate: row.base_hunger_rate,
    baseHappinessRate: row.base_happiness_rate,
    evolutionThresholds: JSON.parse(row.evolution_thresholds),
  };
}

// --- Monsters ---

export function getMonster(id: string): Monster | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM monsters WHERE id = ?").get(id) as any;
  return row ? rowToMonster(row) : null;
}

export function getActiveMonster(): Monster | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM monsters ORDER BY created_at DESC LIMIT 1").get() as any;
  return row ? rowToMonster(row) : null;
}

export function getMonsterCount(): number {
  const db = getDatabase();
  const result = db.query("SELECT COUNT(*) as count FROM monsters").get() as { count: number };
  return result.count;
}

export function createMonster(monster: Omit<Monster, "checksum">): Monster {
  const db = getDatabase();
  const checksum = signMonster(monster);
  const full: Monster = { ...monster, checksum };

  db.query(
    `INSERT INTO monsters (id, name, species_id, genome, stage, hunger, happiness, energy, experience, created_at, hatched_at, last_fed_at, last_interaction_at, evolved_at, checksum, origin, origin_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    full.originFrom
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
  return {
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
  };
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
