import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import { applySchema } from "./schema";
import { seedSpecies } from "../models/species";

const DATA_DIR = join(homedir(), ".tokenmonsters");
const DB_PATH = join(DATA_DIR, "monsters.db");

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
  seedSpecies(instance);

  return instance;
}

export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
