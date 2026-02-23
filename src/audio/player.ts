import { join } from "path";
import { existsSync } from "fs";

const assetsDir = join(import.meta.dir, "assets");

/** Track running afplay processes so we can kill them on cleanup */
const running = new Set<ReturnType<typeof Bun.spawn>>();

/** Check if a setting says sound is enabled */
function isSoundEnabled(name: "evolve" | "feed"): boolean {
  // Lazy import to avoid circular deps
  const { getSetting } = require("../db/queries");
  const muted = getSetting("sound_mute") === "on";
  if (muted) return false;
  const setting = getSetting(`sound_${name}`);
  // evolve defaults to on, feed defaults to off
  if (setting === null) return name === "evolve";
  return setting === "on";
}

/** Play a sound file. Fire-and-forget, swallows all errors. */
export function playSound(name: "evolve" | "feed"): void {
  try {
    if (!isSoundEnabled(name)) return;

    const file = join(assetsDir, `${name}.wav`);
    if (!existsSync(file)) return;

    const proc = Bun.spawn(["afplay", file], {
      stdout: "ignore",
      stderr: "ignore",
    });

    running.add(proc);
    proc.exited.then(() => running.delete(proc)).catch(() => running.delete(proc));
  } catch {
    // Swallow — sound is best-effort
  }
}

/** Kill all running sound processes (call on app destroy) */
export function stopAllSounds(): void {
  for (const proc of running) {
    try { proc.kill(); } catch {}
  }
  running.clear();
}
