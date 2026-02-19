/** XP required to reach a given level: floor(n^2.5 * 170000)
 *
 * Milestone reference (XP ≈ total tokens consumed):
 *   Lv.6  (hatch)  ~15M
 *   Lv.16 (prime)  ~174M
 *   Lv.20          ~304M
 *   Lv.36 (apex)   ~1.3B
 *   Lv.42          ~1.9B
 *   Lv.100         ~17B
 */
export function getXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(Math.pow(level, 2.5) * 170_000);
}

/** Get the current level for a given XP amount */
export function getLevel(xp: number): number {
  if (xp <= 0) return 1;
  // Binary search for the highest level where xpForLevel(n) <= xp
  let lo = 1;
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
