import { test, expect, describe } from "bun:test";
import {
  getCurrentForm,
  getNextForm,
  shouldEvolve,
  getTargetStage,
  getDisplayName,
  getEvolutionProgress,
} from "../src/models/evolution";
import { getLevel, getXpForLevel, getLevelProgress } from "../src/models/level";
import type { Monster, Species } from "../src/models/types";

const TEST_SPECIES: Species = {
  id: 1,
  description: "A luminous creature.",
  rarity: "common",
  baseHungerRate: 3.0,
  baseHappinessRate: 2.0,
  forms: [
    { stage: "egg", name: "Glimmer Egg", description: "A glowing egg.", evolvesAtLevel: null, hatchXp: 5_000_000 },
    { stage: "hatchling", name: "Glimlet", description: "A tiny spark.", evolvesAtLevel: 16 },
    { stage: "prime", name: "Glimmora", description: "Radiant tendrils.", evolvesAtLevel: 36 },
    { stage: "apex", name: "Glimmarion", description: "A blazing beacon.", evolvesAtLevel: null },
  ],
};

// 2-form species (like whisperscale)
const TWO_FORM_SPECIES: Species = {
  id: 3,
  description: "A shy creature.",
  rarity: "uncommon",
  baseHungerRate: 2.0,
  baseHappinessRate: 3.5,
  forms: [
    { stage: "egg", name: "Whisperscale Egg", description: "An egg.", evolvesAtLevel: null, hatchXp: 5_000_000 },
    { stage: "hatchling", name: "Whispling", description: "A serpentine hatchling.", evolvesAtLevel: 16 },
    { stage: "prime", name: "Whispera", description: "Scales shimmer.", evolvesAtLevel: null },
  ],
};

function makeMockMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "test-id",
    name: null,
    speciesId: 1,
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
    mintAddress: null,
    mintNetwork: null,
    claimedBy: null,
    tampered: false,
    ...overrides,
  };
}

describe("Level System", () => {
  test("level 1 requires 1.5M XP", () => {
    expect(getXpForLevel(1)).toBe(1_500_000);
  });

  test("XP curve is monotonically increasing", () => {
    let prev = 0;
    for (let i = 2; i <= 100; i++) {
      const xp = getXpForLevel(i);
      expect(xp).toBeGreaterThan(prev);
      prev = xp;
    }
  });

  test("getLevel returns 0 for 0 XP", () => {
    expect(getLevel(0)).toBe(0);
  });

  test("getLevel returns correct level at exact thresholds", () => {
    expect(getLevel(getXpForLevel(6))).toBe(6);
    expect(getLevel(getXpForLevel(16))).toBe(16);
    expect(getLevel(getXpForLevel(36))).toBe(36);
  });

  test("getLevel returns previous level when just below threshold", () => {
    expect(getLevel(getXpForLevel(6) - 1)).toBe(5);
  });

  test("getLevelProgress returns 0 at start of level", () => {
    const xp = getXpForLevel(5);
    expect(getLevelProgress(xp)).toBe(0);
  });

  test("getLevelProgress returns ~50% at midpoint", () => {
    const xpLow = getXpForLevel(5);
    const xpHigh = getXpForLevel(6);
    const mid = Math.floor((xpLow + xpHigh) / 2);
    const progress = getLevelProgress(mid);
    expect(progress).toBeGreaterThan(40);
    expect(progress).toBeLessThan(60);
  });
});

describe("Evolution Forms", () => {
  test("getCurrentForm returns correct form for each stage", () => {
    expect(getCurrentForm(TEST_SPECIES, "egg")?.name).toBe("Glimmer Egg");
    expect(getCurrentForm(TEST_SPECIES, "hatchling")?.name).toBe("Glimlet");
    expect(getCurrentForm(TEST_SPECIES, "prime")?.name).toBe("Glimmora");
    expect(getCurrentForm(TEST_SPECIES, "apex")?.name).toBe("Glimmarion");
  });

  test("getNextForm returns next form", () => {
    expect(getNextForm(TEST_SPECIES, "egg")?.name).toBe("Glimlet");
    expect(getNextForm(TEST_SPECIES, "hatchling")?.name).toBe("Glimmora");
    expect(getNextForm(TEST_SPECIES, "prime")?.name).toBe("Glimmarion");
    expect(getNextForm(TEST_SPECIES, "apex")).toBe(null);
  });

  test("getNextForm handles 2-form species", () => {
    expect(getNextForm(TWO_FORM_SPECIES, "hatchling")?.name).toBe("Whispera");
    expect(getNextForm(TWO_FORM_SPECIES, "prime")).toBe(null);
  });
});

describe("Evolution Logic", () => {
  test("shouldEvolve returns true for egg when XP meets hatchXp", () => {
    const monster = makeMockMonster({ stage: "egg", experience: 5_000_000 });
    expect(shouldEvolve(monster, TEST_SPECIES, 0)).toBe(true);
  });

  test("shouldEvolve returns false for egg when XP is below hatchXp", () => {
    const monster = makeMockMonster({ stage: "egg", experience: 4_999_999 });
    expect(shouldEvolve(monster, TEST_SPECIES, 0)).toBe(false);
  });

  test("shouldEvolve returns true for hatchling when level meets threshold", () => {
    const xp = getXpForLevel(16);
    const monster = makeMockMonster({ stage: "hatchling", experience: xp });
    expect(shouldEvolve(monster, TEST_SPECIES, 16)).toBe(true);
  });

  test("shouldEvolve returns false for final form", () => {
    const monster = makeMockMonster({ stage: "apex", experience: 999999999 });
    expect(shouldEvolve(monster, TEST_SPECIES, 99)).toBe(false);
  });

  test("getTargetStage hatches egg when XP meets hatchXp", () => {
    expect(getTargetStage("egg", 0, TEST_SPECIES, 5_000_000)).toBe("hatchling");
  });

  test("getTargetStage keeps egg when XP below hatchXp", () => {
    expect(getTargetStage("egg", 0, TEST_SPECIES, 1_000_000)).toBe("egg");
  });

  test("getTargetStage can skip stages with high level and XP", () => {
    expect(getTargetStage("egg", 36, TEST_SPECIES, 5_000_000)).toBe("apex");
  });

  test("getTargetStage evolves hatchling to prime at level 16", () => {
    expect(getTargetStage("hatchling", 16, TEST_SPECIES)).toBe("prime");
  });
});

describe("Display Names", () => {
  test("unnamed monster shows form name", () => {
    const monster = makeMockMonster({ stage: "hatchling", name: null });
    expect(getDisplayName(monster, TEST_SPECIES)).toBe("Glimlet");
  });

  test("named monster shows custom name with form", () => {
    const monster = makeMockMonster({ stage: "hatchling", name: "Spark" });
    expect(getDisplayName(monster, TEST_SPECIES)).toBe("Spark the Glimlet");
  });

  test("egg shows egg form name", () => {
    const monster = makeMockMonster({ stage: "egg", name: null });
    expect(getDisplayName(monster, TEST_SPECIES)).toBe("Glimmer Egg");
  });
});

describe("Evolution Progress", () => {
  test("egg at 0 XP has 0% progress", () => {
    const monster = makeMockMonster({ stage: "egg", experience: 0 });
    expect(getEvolutionProgress(monster, TEST_SPECIES)).toBe(0);
  });

  test("egg at half hatchXp has 50% progress", () => {
    const monster = makeMockMonster({ stage: "egg", experience: 2_500_000 });
    expect(getEvolutionProgress(monster, TEST_SPECIES)).toBe(50);
  });

  test("final form has 100% progress", () => {
    const monster = makeMockMonster({ stage: "apex", experience: 999999999 });
    expect(getEvolutionProgress(monster, TEST_SPECIES)).toBe(100);
  });

  test("2-form species final form has 100% progress", () => {
    const monster = makeMockMonster({ stage: "prime", speciesId: 3, experience: 999999999 });
    expect(getEvolutionProgress(monster, TWO_FORM_SPECIES)).toBe(100);
  });
});
