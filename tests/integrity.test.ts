import { test, expect, describe } from "bun:test";
import { signMonster, verifyMonster } from "../src/models/integrity";
import type { Monster } from "../src/models/types";

function makeMockMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "test-monster-1",
    name: "Spark",
    speciesId: 1,
    genome: Buffer.alloc(32, 0xab),
    stage: "hatchling",
    hunger: 80,
    happiness: 90,
    energy: 70,
    experience: 5000,
    createdAt: 1700000000000,
    hatchedAt: 1700001000000,
    lastFedAt: 1700002000000,
    lastInteractionAt: 1700002000000,
    evolvedAt: 1700001000000,
    checksum: "",
    origin: "generated",
    originFrom: null,
    tampered: false,
    ...overrides,
  };
}

describe("Integrity", () => {
  test("signMonster returns a hex string", () => {
    const monster = makeMockMonster();
    const sig = signMonster(monster);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test("same monster produces same signature", () => {
    const monster = makeMockMonster();
    const sig1 = signMonster(monster);
    const sig2 = signMonster(monster);
    expect(sig1).toBe(sig2);
  });

  test("verifyMonster passes for correctly signed monster", () => {
    const monster = makeMockMonster();
    const checksum = signMonster(monster);
    const signed = { ...monster, checksum };
    expect(verifyMonster(signed)).toBe(true);
  });

  test("verifyMonster fails for tampered XP", () => {
    const monster = makeMockMonster();
    const checksum = signMonster(monster);
    const tampered = { ...monster, checksum, experience: 999999 };
    expect(verifyMonster(tampered)).toBe(false);
  });

  test("verifyMonster fails for tampered stage", () => {
    const monster = makeMockMonster();
    const checksum = signMonster(monster);
    const tampered = { ...monster, checksum, stage: "apex" as const };
    expect(verifyMonster(tampered)).toBe(false);
  });

  test("verifyMonster fails for tampered hunger", () => {
    const monster = makeMockMonster();
    const checksum = signMonster(monster);
    const tampered = { ...monster, checksum, hunger: 100 };
    expect(verifyMonster(tampered)).toBe(false);
  });

  test("different monsters produce different signatures", () => {
    const monster1 = makeMockMonster({ id: "monster-1" });
    const monster2 = makeMockMonster({ id: "monster-2" });
    expect(signMonster(monster1)).not.toBe(signMonster(monster2));
  });
});
