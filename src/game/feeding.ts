import type { Monster, TokenSource } from "../models/types";

/** XP conversion rates — all tokens count, output gets a small bonus */
const XP_PER_INPUT_TOKEN = 1;
const XP_PER_OUTPUT_TOKEN = 2;
const XP_PER_CACHE_TOKEN = 1;

const TOKENS_PER_HUNGER_POINT = 500;
const TOKENS_PER_HAPPINESS_POINT = 1000;
const TOKENS_PER_ENERGY_POINT = 750;

/** Token source multipliers — rarer sources give bonuses */
const SOURCE_MULTIPLIERS: Record<TokenSource, number> = {
  claude: 1.0,
  codex: 1.2,
  opencode: 1.1,
};

export interface FeedResult {
  xpGained: number;
  hungerRestored: number;
  happinessRestored: number;
  energyRestored: number;
  totalTokens: number;
}

/** Calculate the effects of feeding tokens to a monster */
export function calculateFeedResult(
  inputTokens: number,
  outputTokens: number,
  cacheTokens: number,
  source: TokenSource
): FeedResult {
  const totalTokens = inputTokens + outputTokens + cacheTokens;
  const multiplier = SOURCE_MULTIPLIERS[source];

  const rawXp =
    inputTokens * XP_PER_INPUT_TOKEN +
    outputTokens * XP_PER_OUTPUT_TOKEN +
    cacheTokens * XP_PER_CACHE_TOKEN;
  const xpGained = Math.floor(rawXp * multiplier);

  // Hunger/happiness/energy based on real tokens only (not cache)
  const realTokens = inputTokens + outputTokens;
  const hungerRestored = Math.floor(realTokens / TOKENS_PER_HUNGER_POINT);
  const happinessRestored = Math.floor(realTokens / TOKENS_PER_HAPPINESS_POINT);
  const energyRestored = Math.floor(realTokens / TOKENS_PER_ENERGY_POINT);

  return { xpGained, hungerRestored, happinessRestored, energyRestored, totalTokens };
}

/** Apply feed results to a monster, returning the updated monster */
export function applyFeed(monster: Monster, result: FeedResult): Monster {
  return {
    ...monster,
    experience: monster.experience + result.xpGained,
    hunger: Math.min(100, monster.hunger + result.hungerRestored),
    happiness: Math.min(100, monster.happiness + result.happinessRestored),
    energy: Math.min(100, monster.energy + result.energyRestored),
    lastFedAt: Date.now(),
    lastInteractionAt: Date.now(),
  };
}
