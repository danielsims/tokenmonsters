import { createHmac } from "node:crypto";
import type { Monster } from "./types";

const SECRET_KEY = process.env.MONSTER_HMAC_KEY ?? "token-monsters-default-hmac-key-v1";

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
