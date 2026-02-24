import { createHmac, randomBytes } from "node:crypto";
import { join } from "path";
import { homedir } from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { Monster } from "./types";

function loadOrCreateKey(): string {
  if (process.env.MONSTER_HMAC_KEY) return process.env.MONSTER_HMAC_KEY;
  const dir = join(homedir(), ".tokenmon");
  const keyPath = join(dir, "hmac.key");
  if (existsSync(keyPath)) return readFileSync(keyPath, "utf-8").trim();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const key = randomBytes(32).toString("hex");
  writeFileSync(keyPath, key + "\n", { mode: 0o600 });
  return key;
}

const SECRET_KEY = loadOrCreateKey();

/** Fields included in the checksum — order matters */
function serializeForSigning(monster: Omit<Monster, "checksum">): string {
  return JSON.stringify([
    monster.id,
    monster.speciesId,
    monster.genome.toString("hex"),
    monster.stage,
    monster.hunger,
    monster.happiness,
    monster.energy,
    monster.experience,
    monster.createdAt,
    monster.hatchedAt,
    monster.evolvedAt,
    monster.origin,
    monster.originFrom,
  ]);
}

/** Sign a monster's state, returning the HMAC-SHA256 checksum */
export function signMonster(monster: Omit<Monster, "checksum">): string {
  const data = serializeForSigning(monster);
  return createHmac("sha256", SECRET_KEY).update(data).digest("hex");
}

/** Verify a monster's checksum matches its current state */
export function verifyMonster(monster: Monster): boolean {
  const expected = signMonster(monster);
  return expected === monster.checksum;
}
