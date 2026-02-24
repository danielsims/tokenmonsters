import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { applySchema } from "./schema";
import { seedSpecies } from "../models/species";
import { signMonster } from "../models/integrity";
import type { Monster, Stage } from "../models/types";

const DATA_DIR = join(import.meta.dir, "../../data");
const DB_PATH = join(DATA_DIR, "monsters.db");

/** Map old string species IDs to new numeric IDs */
const SPECIES_ID_MAP: Record<string, number> = {
  glimmer: 1, byteclaw: 2, whisperscale: 3, sparkfin: 4,
  nullwyrm: 5, qwerty: 6, kilobit: 7, pinchy: 8,
};

function migrateSpeciesIds(db: Database): void {
  // Check if any monsters have old string species_id values
  const rows = db.query("SELECT DISTINCT species_id FROM monsters").all() as any[];
  const needsMigration = rows.some((r) => typeof r.species_id === "string" && isNaN(Number(r.species_id)));
  if (!needsMigration) return;

  // Disable FK checks during migration, then re-enable
  db.exec("PRAGMA foreign_keys = OFF");

  const monsters = db.query("SELECT * FROM monsters").all() as any[];
  const update = db.prepare("UPDATE monsters SET species_id = ?, checksum = ? WHERE id = ?");

  const tx = db.transaction(() => {
    // Update each monster's species_id and re-sign its checksum
    for (const row of monsters) {
      const oldId = row.species_id;
      const newId = SPECIES_ID_MAP[oldId];
      if (newId === undefined) continue;

      const monster: Omit<Monster, "checksum"> = {
        id: row.id,
        name: row.name,
        speciesId: newId,
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
        origin: row.origin,
        originFrom: row.origin_from,
      };

      const checksum = signMonster(monster);
      update.run(newId, checksum, row.id);
    }

    // Delete old string-keyed species rows (new numeric ones get seeded after)
    for (const oldId of Object.keys(SPECIES_ID_MAP)) {
      db.exec(`DELETE FROM species WHERE id = '${oldId}'`);
    }
  });
  tx();

  db.exec("PRAGMA foreign_keys = ON");
}

let instance: Database | null = null;

export function getDatabase(): Database {
  if (instance) return instance;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  instance = new Database(DB_PATH, { create: true });
  instance.exec("PRAGMA journal_mode = WAL");
  instance.exec("PRAGMA foreign_keys = ON");

  applySchema(instance);
  migrateSpeciesIds(instance);
  seedSpecies(instance);

  return instance;
}

export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
