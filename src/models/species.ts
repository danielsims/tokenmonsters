import { Database } from "bun:sqlite";
import type { Species, EvolutionThresholds } from "./types";

const STARTER_SPECIES: Species[] = [
  {
    id: "glimmer",
    name: "Glimmer",
    description: "A luminous creature born from the glow of countless prompts. Its body pulses with soft light.",
    rarity: "common",
    baseHungerRate: 3.0,
    baseHappinessRate: 2.0,
    evolutionThresholds: { hatchling: 5_000_000, juvenile: 50_000_000, adult: 500_000_000, elder: 5_000_000_000 },
  },
  {
    id: "byteclaw",
    name: "Byteclaw",
    description: "A scrappy digital predator that feeds on stray tokens. Quick to hatch, slow to evolve.",
    rarity: "common",
    baseHungerRate: 4.0,
    baseHappinessRate: 1.5,
    evolutionThresholds: { hatchling: 4_000_000, juvenile: 40_000_000, adult: 400_000_000, elder: 4_000_000_000 },
  },
  {
    id: "whisperscale",
    name: "Whisperscale",
    description: "A shy, serpentine creature that grows stronger with cache hits. Rarely seen in the wild.",
    rarity: "uncommon",
    baseHungerRate: 2.0,
    baseHappinessRate: 3.5,
    evolutionThresholds: { hatchling: 7_000_000, juvenile: 70_000_000, adult: 700_000_000, elder: 7_000_000_000 },
  },
  {
    id: "sparkfin",
    name: "Sparkfin",
    description: "An aquatic-styled creature that swims through data streams. Its fins crackle with energy.",
    rarity: "uncommon",
    baseHungerRate: 2.5,
    baseHappinessRate: 2.5,
    evolutionThresholds: { hatchling: 6_000_000, juvenile: 60_000_000, adult: 600_000_000, elder: 6_000_000_000 },
  },
  {
    id: "nullwyrm",
    name: "Nullwyrm",
    description: "A dragon-like entity that emerges from void pointers and segfaults. Immensely powerful when mature.",
    rarity: "rare",
    baseHungerRate: 5.0,
    baseHappinessRate: 4.0,
    evolutionThresholds: { hatchling: 10_000_000, juvenile: 100_000_000, adult: 1_000_000_000, elder: 10_000_000_000 },
  },
];

export function seedSpecies(db: Database): void {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO species (id, name, description, rarity, base_hunger_rate, base_happiness_rate, evolution_thresholds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const s of STARTER_SPECIES) {
      insert.run(
        s.id,
        s.name,
        s.description,
        s.rarity,
        s.baseHungerRate,
        s.baseHappinessRate,
        JSON.stringify(s.evolutionThresholds)
      );
    }
  });
  tx();
}

export function getStarterSpecies(): Species[] {
  return STARTER_SPECIES;
}

export function getRandomSpecies(): Species {
  // Weighted by rarity: common 50%, uncommon 35%, rare 15%
  const roll = Math.random();
  const commons = STARTER_SPECIES.filter((s) => s.rarity === "common");
  const uncommons = STARTER_SPECIES.filter((s) => s.rarity === "uncommon");
  const rares = STARTER_SPECIES.filter((s) => s.rarity === "rare");

  let pool: Species[];
  if (roll < 0.5) pool = commons;
  else if (roll < 0.85) pool = uncommons;
  else pool = rares;

  return pool[Math.floor(Math.random() * pool.length)];
}
