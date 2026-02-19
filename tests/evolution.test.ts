import { test, expect, describe } from "bun:test";
import {
  getNextStage,
  shouldEvolve,
  getTargetStage,
  getNextThreshold,
  getEvolutionProgress,
} from "../src/models/evolution";
import type { Monster, EvolutionThresholds } from "../src/models/types";

const THRESHOLDS: EvolutionThresholds = {
  hatchling: 1000,
  juvenile: 10000,
  adult: 100000,
  elder: 1000000,
};

function makeMockMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "test-id",
    name: "Test",
    speciesId: "glimmer",
    genome: Buffer.alloc(32),
    stage: "egg",
    hunger: 100,
    happiness: 100,
    energy: 100,
    experience: 0,
    createdAt: Date.now(),
    hatchedAt: null,
    lastFedAt: null,
    lastInteractionAt: null,
    evolvedAt: null,
    checksum: "",
    origin: "generated",
    originFrom: null,
    ...overrides,
  };
}

describe("Evolution", () => {
  test("getNextStage returns correct progression", () => {
    expect(getNextStage("egg")).toBe("hatchling");
    expect(getNextStage("hatchling")).toBe("juvenile");
    expect(getNextStage("juvenile")).toBe("adult");
    expect(getNextStage("adult")).toBe("elder");
    expect(getNextStage("elder")).toBe(null);
  });

  test("shouldEvolve returns true when XP crosses threshold", () => {
    const monster = makeMockMonster({ stage: "egg", experience: 1000 });
    expect(shouldEvolve(monster, THRESHOLDS)).toBe(true);
  });

  test("shouldEvolve returns false when XP is below threshold", () => {
    const monster = makeMockMonster({ stage: "egg", experience: 999 });
    expect(shouldEvolve(monster, THRESHOLDS)).toBe(false);
  });

  test("shouldEvolve returns false for elder stage", () => {
    const monster = makeMockMonster({ stage: "elder", experience: 9999999 });
    expect(shouldEvolve(monster, THRESHOLDS)).toBe(false);
  });

  test("getTargetStage can skip stages with high XP", () => {
    expect(getTargetStage("egg", 100000, THRESHOLDS)).toBe("adult");
    expect(getTargetStage("egg", 1000000, THRESHOLDS)).toBe("elder");
  });

  test("getTargetStage returns current if no threshold met", () => {
    expect(getTargetStage("egg", 500, THRESHOLDS)).toBe("egg");
  });

  test("getNextThreshold returns correct values", () => {
    expect(getNextThreshold("egg", THRESHOLDS)).toBe(1000);
    expect(getNextThreshold("hatchling", THRESHOLDS)).toBe(10000);
    expect(getNextThreshold("elder", THRESHOLDS)).toBe(null);
  });

  test("getEvolutionProgress calculates percentage", () => {
    const egg0 = makeMockMonster({ stage: "egg", experience: 0 });
    expect(getEvolutionProgress(egg0, THRESHOLDS)).toBe(0);

    const egg50 = makeMockMonster({ stage: "egg", experience: 500 });
    expect(getEvolutionProgress(egg50, THRESHOLDS)).toBe(50);

    const egg100 = makeMockMonster({ stage: "egg", experience: 1000 });
    expect(getEvolutionProgress(egg100, THRESHOLDS)).toBe(100);
  });

  test("getEvolutionProgress returns 100 for elder", () => {
    const elder = makeMockMonster({ stage: "elder", experience: 9999999 });
    expect(getEvolutionProgress(elder, THRESHOLDS)).toBe(100);
  });
});
