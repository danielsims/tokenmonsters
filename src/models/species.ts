import { Database } from "bun:sqlite";
import type { Species, EvolutionForm } from "./types";

const STARTER_SPECIES: Species[] = [
  {
    id: "glimmer",
    description: "A luminous creature born from the glow of countless prompts. Its body pulses with soft light.",
    rarity: "common",
    baseHungerRate: 3.0,
    baseHappinessRate: 2.0,
    forms: [
      { stage: "egg", name: "Glimmer Egg", description: "A softly glowing egg.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Glimlet", description: "A tiny spark of living light.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Glimmora", description: "Radiant tendrils of luminous energy.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Glimmarion", description: "A blazing beacon that illuminates the void.", evolvesAtLevel: null },
    ],
  },
  {
    id: "byteclaw",
    description: "A scrappy digital predator that feeds on stray tokens. Quick to hatch, slow to evolve.",
    rarity: "common",
    baseHungerRate: 4.0,
    baseHappinessRate: 1.5,
    forms: [
      { stage: "egg", name: "Byteclaw Egg", description: "A jagged-shelled egg crackling with static.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Bytepup", description: "A scrappy little data-hunter.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Bytesnap", description: "Its jaws can shred corrupted packets.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Bytewrath", description: "A digital apex predator of terrifying power.", evolvesAtLevel: null },
    ],
  },
  {
    id: "whisperscale",
    description: "A shy, serpentine creature that grows stronger with cache hits. Rarely seen in the wild.",
    rarity: "uncommon",
    baseHungerRate: 2.0,
    baseHappinessRate: 3.5,
    forms: [
      { stage: "egg", name: "Whisperscale Egg", description: "An egg that hums at frequencies only caches can hear.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Whispling", description: "A delicate serpentine hatchling.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Whispera", description: "Its scales shimmer with cached memories.", evolvesAtLevel: null },
    ],
  },
  {
    id: "sparkfin",
    description: "An aquatic-styled creature that swims through data streams. Its fins crackle with energy.",
    rarity: "uncommon",
    baseHungerRate: 2.5,
    baseHappinessRate: 2.5,
    forms: [
      { stage: "egg", name: "Sparkfin Egg", description: "An egg that fizzes like carbonated data.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Sparklet", description: "A tiny finned creature trailing sparks.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Sparkeel", description: "An electric eel of pure streaming energy.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Sparkstorm", description: "A tempest of lightning and data.", evolvesAtLevel: null },
    ],
  },
  {
    id: "nullwyrm",
    description: "A dragon-like entity that emerges from void pointers and segfaults. Immensely powerful when mature.",
    rarity: "rare",
    baseHungerRate: 5.0,
    baseHappinessRate: 4.0,
    forms: [
      { stage: "egg", name: "Nullwyrm Egg", description: "An egg that seems to absorb light.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Nullite", description: "A small dragon wreathed in null-space.", evolvesAtLevel: 20 },
      { stage: "prime", name: "Nulldrake", description: "Void energy coils around its growing form.", evolvesAtLevel: 42 },
      { stage: "apex", name: "Nullvoid", description: "A dragon of pure void. Reality bends around it.", evolvesAtLevel: null },
    ],
  },
];

export function seedSpecies(db: Database): void {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO species (id, description, rarity, base_hunger_rate, base_happiness_rate, forms)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const s of STARTER_SPECIES) {
      insert.run(
        s.id,
        s.description,
        s.rarity,
        s.baseHungerRate,
        s.baseHappinessRate,
        JSON.stringify(s.forms)
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
