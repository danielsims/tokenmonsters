export interface Species {
  id: number;
  name: string;
  eggName: string;
  description: string;
  model: string | null; // GLB filename in /models/
}

export interface RarityTier {
  name: string;
  color: string;
  priceLamports: number;
  supply: number | null; // null = unlimited
}

export const RARITY_TIERS: RarityTier[] = [
  { name: "common", color: "#a1a1aa", priceLamports: 200_000_000, supply: null },
  { name: "rare", color: "#c084fc", priceLamports: 1_000_000_000, supply: 1000 },
  { name: "legendary", color: "#4ade80", priceLamports: 5_000_000_000, supply: 500 },
  { name: "founder", color: "#60a5fa", priceLamports: 20_000_000_000, supply: 100 },
];

const PINCHY_SPECIES_ID = 1;

/** Get effective price — Pinchy common is free, everything else follows tier pricing */
export function getPrice(tier: RarityTier, speciesId: number): number {
  if (tier.name === "common" && speciesId === PINCHY_SPECIES_ID) return 0;
  return tier.priceLamports;
}

/** Available species for minting — only those with egg models */
export const SPECIES: Species[] = [
  {
    id: 1,
    name: "Pinchy",
    eggName: "Molting Egg",
    description: "An open-source crustacean that grows by molting its shell. Each molt reveals harder armour underneath.",
    model: "molting-egg.glb",
  },
  {
    id: 2,
    name: "Bytepup",
    eggName: "Jagged Egg",
    description: "A scrappy digital predator that feeds on stray tokens. Quick to hatch, slow to evolve.",
    model: "jagged-egg.glb",
  },
  {
    id: 6,
    name: "Qwerty",
    eggName: "Keycap Egg",
    description: "A mischievous creature that materialises from rapid keystrokes. Patient and quiet at first.",
    model: "keycap-egg.glb",
  },
  {
    id: 7,
    name: "Megabyte",
    eggName: "Dense Egg",
    description: "A compact data creature that doubles in density as it grows. Small but deceptively heavy.",
    model: "dense-egg.glb",
  },
];

export function formatPrice(lamports: number): string {
  if (lamports === 0) return "FREE";
  return `${(lamports / 1_000_000_000).toFixed(2)} SOL`;
}

export function getRarityColor(rarity: string): string {
  switch (rarity) {
    case "common": return "#a1a1aa";
    case "rare": return "#c084fc";
    case "legendary": return "#4ade80";
    case "founder": return "#60a5fa";
    default: return "#a1a1aa";
  }
}
