import { describe, expect, test } from "bun:test";
import { getAvailableSpecies, getRandomSpecies, MODELED_SPECIES_IDS } from "../src/models/species";

describe("random egg selection", () => {
  test("includes every modeled species and excludes unfinished species", () => {
    expect(getAvailableSpecies().map(species => species.id)).toEqual(MODELED_SPECIES_IDS);
  });

  test("gives every playable egg the same share of random values", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const species = getRandomSpecies(() => (i + 0.5) / 1000);
      counts.set(species.id, (counts.get(species.id) ?? 0) + 1);
    }
    expect([...counts.keys()]).toEqual(MODELED_SPECIES_IDS);
    expect([...counts.values()]).toEqual(MODELED_SPECIES_IDS.map(() => 250));
  });

  test("handles the lower and upper ends of the RNG range", () => {
    const available = getAvailableSpecies();
    expect(getRandomSpecies(() => 0)).toBe(available[0]);
    expect(getRandomSpecies(() => 1 - Number.EPSILON)).toBe(available.at(-1)!);
  });
});
