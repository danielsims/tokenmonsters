export interface Species {
  id: number;
  name: string;
  eggName: string;
  description: string;
  rarity: "common" | "uncommon" | "rare";
  model: string | null; // GLB filename in /models/
  priceLamports: number; // 0 = free
}

/** Available species for minting — only those with egg models */
export const SPECIES: Species[] = [
  {
    id: 1,
    name: "Pinchy",
    eggName: "Molting Egg",
    description: "An open-source crustacean that grows by molting its shell. Each molt reveals harder armour underneath.",
    rarity: "common",
    model: "molting-egg.glb",
    priceLamports: 0,
  },
  {
    id: 2,
    name: "Bytepup",
    eggName: "Jagged Egg",
    description: "A scrappy digital predator that feeds on stray tokens. Quick to hatch, slow to evolve.",
    rarity: "common",
    model: "jagged-egg.glb",
    priceLamports: 0,
  },
  {
    id: 6,
    name: "Qwerty",
    eggName: "Keycap Egg",
    description: "A mischievous creature that materialises from rapid keystrokes. Patient and quiet at first.",
    rarity: "rare",
    model: "keycap-egg.glb",
    priceLamports: 1_000_000_000,
  },
  {
    id: 7,
    name: "Megabyte",
    eggName: "Dense Egg",
    description: "A compact data creature that doubles in density as it grows. Small but deceptively heavy.",
    rarity: "rare",
    model: "dense-egg.glb",
    priceLamports: 1_000_000_000,
  },
];

export function formatPrice(lamports: number): string {
  if (lamports === 0) return "FREE";
  return `${(lamports / 1_000_000_000).toFixed(2)} SOL`;
}

export function getRarityColor(rarity: string): string {
  switch (rarity) {
    case "common": return "#a1a1aa";
    case "uncommon": return "#4ade80";
    case "rare": return "#c084fc";
    default: return "#a1a1aa";
  }
}
