import { useState, useEffect, useRef, useMemo } from "react";
import { useGame } from "../../game/context";
import { decodeGenome } from "../../models/genome";
import { getEvolutionProgress } from "../../models/evolution";
import { createEggScene } from "../../three/scenes/egg";
import { createHatchlingScene } from "../../three/scenes/hatchling";
import { createJuvenileScene } from "../../three/scenes/juvenile";
import { createAdultScene } from "../../three/scenes/adult";
import type { Stage, GenomeTraits } from "../../models/types";

/**
 * 3D monster renderer using ThreeRenderable.
 *
 * When ThreeRenderable is available from @opentui/core/3d, this component
 * renders real Three.js scenes in the terminal. Otherwise it falls back
 * to ASCII art representation.
 */

let ThreeRenderable: any = null;
try {
  // Dynamic import — may not be available in all environments
  const mod = await import("@opentui/core/3d");
  ThreeRenderable = mod.ThreeRenderable;
} catch {
  // Fallback to ASCII
}

function getAsciiArt(stage: Stage, traits: GenomeTraits): string {
  const bodyType = traits.bodyShape[0];

  switch (stage) {
    case "egg":
      return [
        "      ___      ",
        "    /     \\    ",
        "   |  * *  |   ",
        "   |       |   ",
        "    \\_____/    ",
        "               ",
      ].join("\n");

    case "hatchling":
      return bodyType < 8
        ? [
            "    (\\_/)     ",
            "    (o.o)     ",
            "    (> <)     ",
            "               ",
          ].join("\n")
        : [
            "     ^  ^     ",
            "    (o  o)    ",
            "    /|  |\\   ",
            "     ~~~~     ",
          ].join("\n");

    case "juvenile":
      return bodyType < 8
        ? [
            "    /\\_/\\     ",
            "   ( o.o )    ",
            "   > ^ <      ",
            "  /|   |\\    ",
            "  (_| |_)     ",
          ].join("\n")
        : [
            "   .-\"\"\"-.    ",
            "  / o   o \\   ",
            " |    ^    |  ",
            " |  \\___/  |  ",
            "  \\       /   ",
            "   '-...-'    ",
          ].join("\n");

    case "adult":
    case "elder":
      return bodyType < 8
        ? [
            "    /\\_____/\\  ",
            "   /  o   o  \\ ",
            "  |    ___    |",
            "  |   /   \\   |",
            "  |  |     |  |",
            "   \\_|     |_/ ",
            "     |  |  |   ",
            "     |__|__|   ",
          ].join("\n")
        : [
            "      _____    ",
            "   .-'     '-. ",
            "  / \\O     O/ \\",
            " |   \\  ^  /   |",
            " |    '---'    |",
            "  \\  /     \\  /",
            "   \\/_______\\/",
            "    /|     |\\  ",
          ].join("\n");
  }
}

export function MonsterScene() {
  const { monster, species } = useGame();

  if (!monster || !species) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text fg="#666666">No monster yet...</text>
      </box>
    );
  }

  const traits = useMemo(() => decodeGenome(monster.genome), [monster.genome]);
  const progress = getEvolutionProgress(monster, species.evolutionThresholds);

  // For now, use ASCII fallback. ThreeRenderable will be wired in when available.
  const art = getAsciiArt(monster.stage, traits);
  const primaryHue = traits.primaryColor[0] * 22.5;
  const color = `hsl(${primaryHue}, 70%, 60%)`;

  return (
    <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <text fg={color}>{art}</text>
      {monster.stage === "egg" && progress > 70 && (
        <text fg="#ffaa00">
          {"\n"}* The egg is wobbling! *
        </text>
      )}
    </box>
  );
}
