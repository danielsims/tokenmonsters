import { join } from "path";
import { existsSync } from "fs";

const assetsDir = join(import.meta.dir, "assets");

type SoundName = "feed" | "level-up" | "evolve-alert" | "evolve-complete";

/** Track running afplay processes so we can kill them on cleanup */
const running = new Set<ReturnType<typeof Bun.spawn>>();

/** Track the looping alert so we can stop it */
let alertLoop: ReturnType<typeof setInterval> | null = null;
let alertTimeout: ReturnType<typeof setTimeout> | null = null;

/** Check if sounds are globally muted */
function isMuted(): boolean {
  const { getSetting } = require("../db/queries");
  return getSetting("sound_mute") === "on";
}

/** Play a sound file once. Fire-and-forget, swallows all errors. */
export function playSound(name: SoundName): void {
  try {
    if (isMuted()) return;

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

/** Start looping the evolve alert until stopAlert() is called or maxDuration reached */
export function startAlert(maxDurationMs = 30_000): void {
  if (isMuted()) return;
  stopAlert();

  const file = join(assetsDir, "evolve-alert.wav");
  if (!existsSync(file)) return;

  // Play immediately, then loop
  const play = () => {
    const proc = Bun.spawn(["afplay", file], {
      stdout: "ignore",
      stderr: "ignore",
    });
    running.add(proc);
    proc.exited.then(() => running.delete(proc)).catch(() => running.delete(proc));
  };

  play();
  // Alert sound is ~2.4s, loop every 3s to leave a gap
  alertLoop = setInterval(play, 3000);

  // Auto-stop after max duration
  alertTimeout = setTimeout(() => stopAlert(), maxDurationMs);
}

/** Stop the looping evolve alert */
export function stopAlert(): void {
  if (alertLoop) {
    clearInterval(alertLoop);
    alertLoop = null;
  }
  if (alertTimeout) {
    clearTimeout(alertTimeout);
    alertTimeout = null;
  }
}

/** Kill all running sound processes (call on app destroy) */
export function stopAllSounds(): void {
  stopAlert();
  for (const proc of running) {
    try { proc.kill(); } catch {}
  }
  running.clear();
}
