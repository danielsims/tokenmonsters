import { test, expect, describe } from "bun:test";
import { calculateFeedResult, applyFeed } from "../src/game/feeding";
import type { Monster } from "../src/models/types";

function makeMockMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "test-id",
    name: "Test",
    speciesId: 1,
    genome: Buffer.alloc(32),
    stage: "hatchling",
    hunger: 50,
    happiness: 50,
    energy: 50,
    experience: 1000,
    createdAt: Date.now(),
    hatchedAt: Date.now(),
    lastFedAt: null,
    lastInteractionAt: null,
    evolvedAt: null,
    checksum: "",
    origin: "generated",
    originFrom: null,
    ...overrides,
  };
}

describe("Feeding", () => {
  test("calculateFeedResult weights token types differently", () => {
    // 500 input (1x) + 300 output (2x) + 200 cache (1x) = 500 + 600 + 200 = 1300
    const result = calculateFeedResult(500, 300, 200, "claude");
    expect(result.totalTokens).toBe(1000);
    expect(result.xpGained).toBe(1300);
  });

  test("cache tokens give full XP", () => {
    const cacheOnly = calculateFeedResult(0, 0, 100000, "claude");
    expect(cacheOnly.xpGained).toBe(100000);
  });

  test("output tokens are worth 2x input", () => {
    const inputOnly = calculateFeedResult(1000, 0, 0, "claude");
    const outputOnly = calculateFeedResult(0, 1000, 0, "claude");
    expect(inputOnly.xpGained).toBe(1000);
    expect(outputOnly.xpGained).toBe(2000);
  });

  test("calculateFeedResult applies source multiplier", () => {
    const claude = calculateFeedResult(1000, 0, 0, "claude");
    const codex = calculateFeedResult(1000, 0, 0, "codex");

    expect(claude.xpGained).toBe(1000); // 1.0x
    expect(codex.xpGained).toBe(1200); // 1.2x
  });

  test("hunger restoration based on real tokens only", () => {
    // 500 input + 500 output = 1000 real tokens / 500 = 2
    const result = calculateFeedResult(500, 500, 100000, "claude");
    expect(result.hungerRestored).toBe(2);
  });

  test("applyFeed increases monster stats", () => {
    const monster = makeMockMonster({ experience: 1000, hunger: 50 });
    const result = calculateFeedResult(500, 500, 0, "claude");
    const updated = applyFeed(monster, result);

    expect(updated.experience).toBe(1000 + result.xpGained);
    expect(updated.hunger).toBeGreaterThanOrEqual(50);
    expect(updated.lastFedAt).toBeGreaterThan(0);
  });

  test("applyFeed caps stats at 100", () => {
    const monster = makeMockMonster({ hunger: 95, happiness: 98, energy: 99 });
    const result = calculateFeedResult(50000, 50000, 0, "claude");
    const updated = applyFeed(monster, result);

    expect(updated.hunger).toBe(100);
    expect(updated.happiness).toBe(100);
    expect(updated.energy).toBe(100);
  });

  test("small token amounts give zero restoration but still give XP", () => {
    const result = calculateFeedResult(10, 10, 0, "claude");
    expect(result.xpGained).toBe(30); // 10*1 + 10*2
    expect(result.hungerRestored).toBe(0); // 20 < 500
  });
});
