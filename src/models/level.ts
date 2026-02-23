/** XP curve: egg hatches at 1.5M tokens, then level N costs N * 1M tokens.
 *
 * Formula: XP(N) = 500_000 * (N² + N + 1) for N >= 1, XP(0) = 0
 *
 * Milestone reference (cumulative tokens):
 *   Lv.1  (hatch)      1.5M
 *   Lv.6  (evolve 1)   21.5M
 *   Lv.16 (evolve 2)   ~137M
 *   Lv.50              ~1.3B
 *   Lv.100             ~5B
 */
export function getXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return 500_000 * (level * level + level + 1);
}

/** Get the current level for a given XP amount */
export function getLevel(xp: number): number {
  if (xp <= 0) return 0;
  // Binary search for the highest level where xpForLevel(n) <= xp
  let lo = 0;
  let hi = 100;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (getXpForLevel(mid) <= xp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** XP needed to reach the next level from the current one */
export function getXpForNextLevel(level: number): number {
  if (level >= 100) return 0;
  return getXpForLevel(level + 1);
}

/** Progress within the current level as a percentage (0-100) */
export function getLevelProgress(xp: number): number {
  const level = getLevel(xp);
  if (level >= 100) return 100;

  const currentLevelXp = getXpForLevel(level);
  const nextLevelXp = getXpForLevel(level + 1);
  const range = nextLevelXp - currentLevelXp;
  if (range <= 0) return 100;

  const progress = ((xp - currentLevelXp) / range) * 100;
  return Math.min(100, Math.max(0, progress));
}
