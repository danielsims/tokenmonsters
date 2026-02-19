import type { Monster, Species, Stage, EvolutionThresholds } from "./types";

const STAGE_ORDER: Stage[] = ["egg", "hatchling", "juvenile", "adult", "elder"];

/** Get the next stage after the current one, or null if at max */
export function getNextStage(current: Stage): Stage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

/** Check if a monster should evolve based on its XP and species thresholds */
export function shouldEvolve(monster: Monster, thresholds: EvolutionThresholds): boolean {
  const next = getNextStage(monster.stage);
  if (!next) return false;

  const threshold = thresholds[next as keyof EvolutionThresholds];
  if (threshold === undefined) return false;

  return monster.experience >= threshold;
}

/** Get the target stage for a given XP amount (may skip stages if enough XP) */
export function getTargetStage(
  currentStage: Stage,
  experience: number,
  thresholds: EvolutionThresholds
): Stage {
  let stage = currentStage;
  for (const s of STAGE_ORDER) {
    if (STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(currentStage)) continue;
    const threshold = thresholds[s as keyof EvolutionThresholds];
    if (threshold !== undefined && experience >= threshold) {
      stage = s;
    }
  }
  return stage;
}

/** Get XP required for the next evolution */
export function getNextThreshold(
  currentStage: Stage,
  thresholds: EvolutionThresholds
): number | null {
  const next = getNextStage(currentStage);
  if (!next) return null;
  return thresholds[next as keyof EvolutionThresholds] ?? null;
}

/** Calculate evolution progress as a percentage (0-100) */
export function getEvolutionProgress(
  monster: Monster,
  thresholds: EvolutionThresholds
): number {
  const nextThreshold = getNextThreshold(monster.stage, thresholds);
  if (nextThreshold === null) return 100;

  // Find the current stage's threshold (or 0 for egg)
  const currentThreshold =
    monster.stage === "egg"
      ? 0
      : thresholds[monster.stage as keyof EvolutionThresholds] ?? 0;

  const range = nextThreshold - currentThreshold;
  if (range <= 0) return 100;

  const progress = ((monster.experience - currentThreshold) / range) * 100;
  return Math.min(100, Math.max(0, progress));
}
