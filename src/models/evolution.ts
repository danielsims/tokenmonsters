import type { Monster, Species, Stage, EvolutionForm } from "./types";
import { getLevel } from "./level";

const STAGE_ORDER: Stage[] = ["egg", "hatchling", "prime", "apex"];

/** Get the form data for the monster's current stage */
export function getCurrentForm(species: Species, stage: Stage): EvolutionForm | null {
  return species.forms.find((f) => f.stage === stage) ?? null;
}

/** Get the next form after the current stage, or null if at final form */
export function getNextForm(species: Species, currentStage: Stage): EvolutionForm | null {
  const idx = STAGE_ORDER.indexOf(currentStage);
  if (idx === -1) return null;

  // Find the next form in stage order that exists for this species
  for (let i = idx + 1; i < STAGE_ORDER.length; i++) {
    const form = species.forms.find((f) => f.stage === STAGE_ORDER[i]);
    if (form) return form;
  }
  return null;
}

/** Check if a form is ready to advance */
function formCanAdvance(form: EvolutionForm, level: number, xp: number): boolean {
  // Eggs use flat XP threshold
  if (form.stage === "egg") {
    return form.hatchXp != null && xp >= form.hatchXp;
  }
  // Everything else uses levels
  return form.evolvesAtLevel !== null && level >= form.evolvesAtLevel;
}

/** Check if a monster should evolve based on its level/xp and species form thresholds */
export function shouldEvolve(monster: Monster, species: Species, level: number): boolean {
  const currentForm = getCurrentForm(species, monster.stage);
  if (!currentForm) return false;

  return formCanAdvance(currentForm, level, monster.experience);
}

/** Get the target stage for a given level/xp (may skip stages) */
export function getTargetStage(
  currentStage: Stage,
  level: number,
  species: Species,
  xp: number = 0
): Stage {
  let stage = currentStage;
  const currentIdx = STAGE_ORDER.indexOf(currentStage);

  for (let i = currentIdx; i < STAGE_ORDER.length; i++) {
    const form = species.forms.find((f) => f.stage === STAGE_ORDER[i]);
    if (!form) continue;

    if (formCanAdvance(form, level, xp)) {
      const nextForm = getNextForm(species, STAGE_ORDER[i]);
      if (nextForm) {
        stage = nextForm.stage;
      }
    }
  }

  return stage;
}

/** Get the display name for a monster */
export function getDisplayName(monster: Monster, species: Species): string {
  const form = getCurrentForm(species, monster.stage);
  const formName = form?.name ?? monster.stage;

  if (monster.name) {
    const capitalized = monster.name.charAt(0).toUpperCase() + monster.name.slice(1);
    return `${capitalized} the ${formName}`;
  }
  return formName;
}

/** Get evolution progress toward next form as a percentage (0-100) */
export function getEvolutionProgress(monster: Monster, species: Species): number {
  const currentForm = getCurrentForm(species, monster.stage);
  if (!currentForm) return 100;

  // Eggs: flat XP progress
  if (currentForm.stage === "egg") {
    if (!currentForm.hatchXp) return 100;
    const progress = (monster.experience / currentForm.hatchXp) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  // Post-hatch: level-based progress
  if (currentForm.evolvesAtLevel === null) return 100;

  const level = getLevel(monster.experience);
  const stageIdx = STAGE_ORDER.indexOf(monster.stage);
  let startLevel = 1;
  if (stageIdx > 0) {
    const prevForm = species.forms.find((f) => f.stage === STAGE_ORDER[stageIdx - 1]);
    if (prevForm?.evolvesAtLevel) {
      startLevel = prevForm.evolvesAtLevel;
    }
  }

  const range = currentForm.evolvesAtLevel - startLevel;
  if (range <= 0) return 100;

  const progress = ((level - startLevel) / range) * 100;
  return Math.min(100, Math.max(0, progress));
}
