import type { Monster, Species, Stage, TokenSource } from "../models/types";
import { shouldEvolve, getTargetStage } from "../models/evolution";
import { calculateFeedResult, applyFeed, type FeedResult } from "./feeding";
import { getSpeciesById } from "../db/queries";
import { updateMonster, recordTokenFeed, recordEvolution } from "../db/queries";

/** How often the game tick runs (ms) */
export const TICK_INTERVAL = 30_000; // 30 seconds

export interface TickResult {
  hungerLost: number;
  happinessLost: number;
  energyLost: number;
  evolved: boolean;
  newStage?: Stage;
}

/** Run a game tick: decay stats based on time elapsed and species rates */
export function gameTick(monster: Monster, species: Species, now: number): { monster: Monster; result: TickResult } {
  const lastTick = monster.lastInteractionAt ?? monster.createdAt;
  const elapsedHours = (now - lastTick) / (1000 * 60 * 60);

  // Only decay if not an egg
  let hungerLost = 0;
  let happinessLost = 0;
  let energyLost = 0;

  if (monster.stage !== "egg") {
    hungerLost = Math.floor(species.baseHungerRate * elapsedHours);
    happinessLost = Math.floor(species.baseHappinessRate * elapsedHours);
    // Energy decays at half the hunger rate
    energyLost = Math.floor((species.baseHungerRate * 0.5) * elapsedHours);
  }

  const updated: Monster = {
    ...monster,
    hunger: Math.max(0, monster.hunger - hungerLost),
    happiness: Math.max(0, monster.happiness - happinessLost),
    energy: Math.max(0, monster.energy - energyLost),
    lastInteractionAt: now,
  };

  return {
    monster: updated,
    result: { hungerLost, happinessLost, energyLost, evolved: false },
  };
}

/** Feed tokens to a monster and check for evolution */
export function feedMonster(
  monster: Monster,
  species: Species,
  source: TokenSource,
  inputTokens: number,
  outputTokens: number,
  cacheTokens: number
): { monster: Monster; feedResult: FeedResult; evolved: boolean; newStage?: Stage } {
  const feedResult = calculateFeedResult(inputTokens, outputTokens, cacheTokens, source);
  let updated = applyFeed(monster, feedResult);

  // Record the feed
  recordTokenFeed({
    monsterId: monster.id,
    source,
    inputTokens,
    outputTokens,
    cacheTokens,
    fedAt: Date.now(),
  });

  // Check evolution
  const targetStage = getTargetStage(updated.stage, updated.experience, species.evolutionThresholds);
  let evolved = false;
  let newStage: Stage | undefined;

  if (targetStage !== updated.stage) {
    const fromStage = updated.stage;
    evolved = true;
    newStage = targetStage;

    updated = {
      ...updated,
      stage: targetStage,
      evolvedAt: Date.now(),
      hatchedAt: updated.hatchedAt ?? (fromStage === "egg" ? Date.now() : null),
    };

    recordEvolution({
      monsterId: monster.id,
      fromStage,
      toStage: targetStage,
      evolvedAt: Date.now(),
      triggerReason: `Fed ${feedResult.totalTokens} tokens from ${source}`,
      tokensAtEvolution: updated.experience,
    });
  }

  // Persist
  updated = updateMonster(updated);

  return { monster: updated, feedResult, evolved, newStage };
}
