import { Database } from "bun:sqlite";
import type { Species } from "./types";

const STARTER_SPECIES: Species[] = [
  {
    id: 1,
    description: "An open-source crustacean that grows by molting its shell. Each molt reveals harder armour underneath. Thrives in any environment you put it in.",
    rarity: "common",
    baseHungerRate: 3.5,
    baseHappinessRate: 2.0,
    forms: [
      { stage: "egg", name: "Molting Egg", description: "An egg already shedding its outer layer.", evolvesAtLevel: null, hatchXp: 5_000_000 },
      { stage: "hatchling", name: "Pinchy", description: "A small digital crab that snips rogue packets. Had three names before it hatched.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Viceclaw", description: "Fiercely loyal to its human. Its claws crack encryption.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Gigaclaw", description: "A colossal siege crab. One open claw collapses entire data structures.", evolvesAtLevel: null },
    ],
  },
  {
    id: 2,
    description: "A scrappy digital predator that feeds on stray tokens. Quick to hatch, slow to evolve.",
    rarity: "common",
    baseHungerRate: 4.0,
    baseHappinessRate: 1.5,
    forms: [
      { stage: "egg", name: "Jagged Egg", description: "A sharp-shelled egg crackling with static. Bites back if you hold it wrong.", evolvesAtLevel: null, hatchXp: 2_500_000 },
      { stage: "hatchling", name: "Bytepup", description: "A scrappy little data-hunter. All teeth, no patience.", evolvesAtLevel: 6 },
      { stage: "prime", name: "Bytesnap", description: "Its jaws shred corrupted packets. Loyal once fed, vicious when hungry.", evolvesAtLevel: 16 },
      { stage: "apex", name: "Bytewrath", description: "A digital apex predator. Entire file systems go quiet when it hunts.", evolvesAtLevel: null },
    ],
  },
  {
    id: 3,
    description: "A shy, serpentine creature that slips between memory addresses. Grows stronger with cache hits. Rarely seen in the wild.",
    rarity: "uncommon",
    baseHungerRate: 2.0,
    baseHappinessRate: 3.5,
    forms: [
      { stage: "egg", name: "Hollow Egg", description: "Feels empty. Press your ear to it and you'll hear cached whispers.", evolvesAtLevel: null, hatchXp: 5_000_000 },
      { stage: "hatchling", name: "Slink", description: "A translucent serpent that slips between memory addresses. Blink and it's gone.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Cachefang", description: "Its bite injects cached memories. Silent, precise, and impossible to find twice.", evolvesAtLevel: null },
    ],
  },
  {
    id: 4,
    description: "An aquatic creature that swims through data streams. Its fins crackle with current.",
    rarity: "uncommon",
    baseHungerRate: 2.5,
    baseHappinessRate: 2.5,
    forms: [
      { stage: "egg", name: "Fizzing Egg", description: "An egg that crackles and pops like static discharge. Don't drop it in water.", evolvesAtLevel: null, hatchXp: 5_000_000 },
      { stage: "hatchling", name: "Fry", description: "A tiny fish trailing sparks through shallow data streams.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Volteel", description: "An electric eel surging through data currents. Touch it and your hair stands up.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Ampstorm", description: "A tempest of pure amperage. Entire networks go dark in its wake.", evolvesAtLevel: null },
    ],
  },
  {
    id: 5,
    description: "A dragon-like entity that emerges from void pointers and segfaults. Immensely powerful when mature.",
    rarity: "rare",
    baseHungerRate: 5.0,
    baseHappinessRate: 4.0,
    forms: [
      { stage: "egg", name: "Absent Egg", description: "An egg that shouldn't exist. It absorbs light and returns nothing.", evolvesAtLevel: null, hatchXp: 7_500_000 },
      { stage: "hatchling", name: "Segfault", description: "A small, glitchy dragon. Things crash in its presence.", evolvesAtLevel: 20 },
      { stage: "prime", name: "Voidmaw", description: "Void energy pours from its jaws. Memory corrupts at its touch.", evolvesAtLevel: 42 },
      { stage: "apex", name: "Nullvoid", description: "A void mage that rewrites reality. Its spells are segfaults, its staff a dangling pointer.", evolvesAtLevel: null },
    ],
  },
  {
    id: 6,
    description: "A mischievous creature that materialises from rapid keystrokes. Patient and quiet at first, it grows into something unsettlingly aware.",
    rarity: "rare",
    baseHungerRate: 2.5,
    baseHappinessRate: 3.0,
    forms: [
      { stage: "egg", name: "Keycap Egg", description: "An egg that rattles like a mechanical switch.", evolvesAtLevel: null, hatchXp: 5_000_000 },
      { stage: "hatchling", name: "Qwerty", description: "A tiny creature that skitters across keyboards, chattering in clicks.", evolvesAtLevel: 15 },
      { stage: "prime", name: "Daemon", description: "It runs silently in the background now. Always watching, never stopping.", evolvesAtLevel: null },
    ],
  },
  {
    id: 7,
    description: "A compact data creature that doubles in density as it grows. Small but deceptively heavy.",
    rarity: "rare",
    baseHungerRate: 3.0,
    baseHappinessRate: 2.0,
    forms: [
      { stage: "egg", name: "Dense Egg", description: "A heavy little egg packed tight with raw data.", evolvesAtLevel: null, hatchXp: 5_000_000 },
      { stage: "hatchling", name: "Megabyte", description: "A compact critter packed with raw data.", evolvesAtLevel: 18 },
      { stage: "prime", name: "Gigabyte", description: "A lumbering but lovable tank. Stores everything, forgets nothing.", evolvesAtLevel: null },
    ],
  },
  {
    id: 8,
    description: "A luminous creature born from the glow of countless terminal prompts. Its body pulses with soft light.",
    rarity: "common",
    baseHungerRate: 3.0,
    baseHappinessRate: 2.0,
    forms: [
      { stage: "egg", name: "Dim Egg", description: "A barely-glowing egg. Hold it to a dark screen and it pulses.", evolvesAtLevel: null, hatchXp: 5_000_000 },
      { stage: "hatchling", name: "Flicker", description: "An unstable little light that blinks in and out of visibility.", evolvesAtLevel: 16 },
      { stage: "prime", name: "Luminos", description: "A steady beam of living light. Illuminates corrupted sectors wherever it drifts.", evolvesAtLevel: 36 },
      { stage: "apex", name: "Phosphor", description: "A blazing relic of CRT glory. Its glow burns permanent afterimages.", evolvesAtLevel: null },
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
