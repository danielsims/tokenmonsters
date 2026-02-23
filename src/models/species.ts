import { Database } from "bun:sqlite";
import type { Species, EvolutionForm } from "./types";

const STARTER_SPECIES: Species[] = [
  {
    id: "glimmer",
    description: "A luminous creature born from the glow of countless terminal prompts. Its body pulses with soft light.",
    rarity: "common",
    baseHungerRate: 3.0,
    baseHappinessRate: 2.0,
    forms: [
      { stage: "egg", name: "Dim Egg", description: "A barely-glowing egg. Hold it to a dark screen and it pulses.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Flicker", description: "An unstable little light that blinks in and out of visibility.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Luminos", description: "A steady beam of living light. Illuminates corrupted sectors wherever it drifts.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Phosphor", description: "A blazing relic of CRT glory. Its glow burns permanent afterimages.", evolvesAtLevel: null },
    ],
  },
  {
    id: "byteclaw",
    description: "A scrappy digital predator that feeds on stray tokens. Quick to hatch, slow to evolve.",
    rarity: "common",
    baseHungerRate: 4.0,
    baseHappinessRate: 1.5,
    forms: [
      { stage: "egg", name: "Jagged Egg", description: "A sharp-shelled egg crackling with static. Bites back if you hold it wrong.", evolvesAtLevel: 1 },
      { stage: "hatchling", name: "Bytepup", description: "A scrappy little data-hunter. All teeth, no patience.", evolvesAtLevel: 6 },
      { stage: "prime", name: "Bytesnap", description: "Its jaws shred corrupted packets. Loyal once fed, vicious when hungry.", evolvesAtLevel: 16 },
      { stage: "apex", name: "Bytewrath", description: "A digital apex predator. Entire file systems go quiet when it hunts.", evolvesAtLevel: null },
    ],
  },
  {
    id: "whisperscale",
    description: "A shy, serpentine creature that slips between memory addresses. Grows stronger with cache hits. Rarely seen in the wild.",
    rarity: "uncommon",
    baseHungerRate: 2.0,
    baseHappinessRate: 3.5,
    forms: [
      { stage: "egg", name: "Hollow Egg", description: "Feels empty. Press your ear to it and you'll hear cached whispers.", evolvesAtLevel: 6 },
      { stage: "hatchling", name: "Slink", description: "A translucent serpent that slips between memory addresses. Blink and it's gone.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Cachefang", description: "Its bite injects cached memories. Silent, precise, and impossible to find twice.", evolvesAtLevel: null },
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
