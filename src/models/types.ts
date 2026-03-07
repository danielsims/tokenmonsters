export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type Stage = "egg" | "hatchling" | "prime" | "apex";
export type Origin = "generated" | "gifted";
export type TokenSource = "claude" | "codex" | "opencode";

export interface EvolutionForm {
  stage: Stage;
  name: string;
  description: string;
  evolvesAtLevel: number | null; // null = final form or egg (eggs use hatchXp)
  hatchXp?: number; // flat XP threshold for egg → hatchling (eggs only)
}

export interface Species {
  id: number;
  description: string;
  rarity: Rarity;
  baseHungerRate: number;
  baseHappinessRate: number;
  forms: EvolutionForm[];
}

export interface Monster {
  id: string;
  name: string | null;
  speciesId: number;
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
  /** Computed at load time — true if HMAC checksum doesn't match */
  tampered: boolean;
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
