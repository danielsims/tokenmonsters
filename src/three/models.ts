import { resolve } from "path";
import { existsSync } from "fs";
import { homedir } from "os";

/** Resolve the models directory — prefer ~/.tokenmonsters/models/ (downloaded),
 *  fall back to source tree (dev) */
export function getModelsRoot(): string {
  const userDir = resolve(homedir(), ".tokenmonsters", "models");
  if (existsSync(userDir)) return userDir;
  // Dev fallback: models in source tree
  return resolve(import.meta.dir, "models");
}
