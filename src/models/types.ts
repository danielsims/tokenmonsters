export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type Stage = "egg" | "hatchling" | "juvenile" | "adult" | "elder";
export type Origin = "generated" | "gifted";
export type TokenSource = "claude" | "codex" | "opencode";

export interface EvolutionThresholds {
  hatchling: number;
  juvenile: number;
  adult: number;
  elder: number;
}

export interface Species {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  baseHungerRate: number;
  baseHappinessRate: number;
  evolutionThresholds: EvolutionThresholds;
}

export interface Monster {
  id: string;
  name: string | null;
  speciesId: string;
  genome: Buffer;
  stage: Stage;
  hunger: number;
  happiness: number;
  energy: number;
  experience: number;
  createdAt: number;
  hatchedAt: number | null;
  lastFedAt: number | null;
  lastInteractionAt: number | null;
  evolvedAt: number | null;
  checksum: string;
  origin: Origin;
  originFrom: string | null;
}

export interface TokenFeed {
  id: number;
  monsterId: string;
  source: TokenSource;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  fedAt: number;
}

export interface EvolutionRecord {
  id: number;
  monsterId: string;
  fromStage: Stage;
  toStage: Stage;
  evolvedAt: number;
  triggerReason: string;
  tokensAtEvolution: number;
}

/** Decoded genome traits from the 256-bit genome */
export interface GenomeTraits {
  bodyShape: number[];
  pattern: number[];
  primaryColor: number[];
  secondaryColor: number[];
  eyeStyle: number[];
  expression: number[];
  features: number[];
  special: number[];
}

/** HSL color derived from genome */
export interface GenomeColor {
  h: number;
  s: number;
  l: number;
}
