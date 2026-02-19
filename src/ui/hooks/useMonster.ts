import { useCallback } from "react";
import { generateGenome } from "../../models/genome";
import { getRandomSpecies } from "../../models/species";
import { createMonster, getMonsterCount } from "../../db/queries";
import { useGame } from "../../game/context";
import type { Monster } from "../../models/types";

export function useMonster() {
  const game = useGame();

  const isFirstRun = useCallback(() => {
    return getMonsterCount() === 0;
  }, []);

  const generateEgg = useCallback(() => {
    const species = getRandomSpecies();
    const genome = generateGenome();
    const now = Date.now();

    const monsterData: Omit<Monster, "checksum"> = {
      id: crypto.randomUUID(),
      name: null,
      speciesId: species.id,
      genome,
      stage: "egg",
      hunger: 100,
      happiness: 100,
      energy: 100,
      experience: 0,
      createdAt: now,
      hatchedAt: null,
      lastFedAt: null,
      lastInteractionAt: now,
      evolvedAt: null,
      origin: "generated",
      originFrom: null,
    };

    createMonster(monsterData);
    game.refresh();
  }, [game]);

  return {
    ...game,
    isFirstRun,
    generateEgg,
  };
}
