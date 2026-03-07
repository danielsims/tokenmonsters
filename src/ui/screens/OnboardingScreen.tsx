import { useMemo, useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useMonster } from "../hooks/useMonster";
import { getSpeciesById, setSetting, getMonsterCount, getEggSlots, getTotalXp, XP_PER_EGG } from "../../db/queries";
import { getStarterSpecies, getRandomSpecies } from "../../models/species";
import { RegistryPreview } from "../components/RegistryPreview";
import { t, setTheme } from "../theme";

const WELCOME_ART = [
  "  _____ ___  _  _____ _  _   __  __  ___  _  _ ___ _____ ___ ___  ___",
  " |_   _/ _ \\| |/ / __| \\| | |  \\/  |/ _ \\| \\| / __|_   _| __| _ \\/ __|",
  "   | || (_) | ' <| _|| .` | | |\\/| | (_) | .` \\__ \\ | | | _||   /\\__ \\",
  "   |_| \\___/|_|\\_\\___|_|\\_| |_|  |_|\\___/|_|\\_|___/ |_| |___|_|_\\|___/",
].join("\n");

function getRarityColor(rarity: string): string {
  switch (rarity) {
    case "common": return "#a1a1aa";
    case "uncommon": return "#4ade80";
    case "rare": return "#c084fc";
    default: return "#a1a1aa";
  }
}

function formatXp(xp: number): string {
  if (xp >= 1_000_000_000) return `${(xp / 1_000_000_000).toFixed(1)}B`;
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}K`;
  return String(xp);
}

const MODELED_SPECIES_IDS = [1, 2, 6, 7];

interface OnboardingProps {
  onComplete: () => void;
  mode?: "welcome" | "new-egg";
}

export function OnboardingScreen({ onComplete, mode = "welcome" }: OnboardingProps) {
  const { generateSpecificEgg } = useMonster();
  const allSpecies = useMemo(
    () => getStarterSpecies().filter((s) => MODELED_SPECIES_IDS.includes(s.id)),
    [],
  );

  // Check if player can actually claim a new egg
  const canClaim = mode === "welcome" || getMonsterCount() < getEggSlots();
  const totalXp = getTotalXp();
  const nextSlotXp = (getMonsterCount()) * XP_PER_EGG; // XP needed for the next slot
  const xpRemaining = Math.max(0, nextSlotXp - totalXp);

  // For new-egg mode when unlocked, auto-pick a random species
  const randomSpecies = useMemo(() => {
    if (mode !== "new-egg" || !canClaim) return null;
    let species = getRandomSpecies();
    while (!MODELED_SPECIES_IDS.includes(species.id)) {
      species = getRandomSpecies();
    }
    return species;
  }, [mode, canClaim]);

  const [speciesIndex, setSpeciesIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const selectedSpeciesId = mode === "welcome"
    ? allSpecies[speciesIndex].id
    : canClaim
      ? randomSpecies!.id
      : allSpecies[speciesIndex].id;

  const species = useMemo(() => getSpeciesById(selectedSpeciesId), [selectedSpeciesId]);

  const speciesName = species?.forms[0]?.name ?? "Unknown";
  const description = species?.description ?? "";

  // Force catppuccin theme for welcome
  useEffect(() => {
    if (mode === "welcome") {
      setTheme("catppuccin");
      setSetting("theme", "catppuccin");
    }
  }, [mode]);

  useKeyboard((key) => {
    if (confirmed) return;

    if (mode === "welcome") {
      if (key.name === "left") {
        setSpeciesIndex((i) => (i - 1 + allSpecies.length) % allSpecies.length);
      } else if (key.name === "right") {
        setSpeciesIndex((i) => (i + 1) % allSpecies.length);
      } else if (key.name === "return") {
        setConfirmed(true);
        generateSpecificEgg(selectedSpeciesId);
        onComplete();
      }
    } else if (canClaim) {
      if (key.name === "return") {
        setConfirmed(true);
        generateSpecificEgg(selectedSpeciesId);
        onComplete();
      } else if (key.name === "escape") {
        onComplete();
      }
    } else {
      // Locked — browse but can't claim
      if (key.name === "left") {
        setSpeciesIndex((i) => (i - 1 + allSpecies.length) % allSpecies.length);
      } else if (key.name === "right") {
        setSpeciesIndex((i) => (i + 1) % allSpecies.length);
      } else if (key.name === "escape") {
        onComplete();
      }
    }
  });

  const newEggHeader = randomSpecies
    ? `You found a ${randomSpecies.rarity.charAt(0).toUpperCase() + randomSpecies.rarity.slice(1)} ${randomSpecies.forms[0]?.name ?? "Egg"}!`
    : "";

  return (
    <box
      flexDirection="column"
      alignItems="center"
      width="100%"
      height="100%"
      backgroundColor={t.bg.base}
    >
      {/* ASCII Art Header */}
      <box paddingY={1}>
        <text fg={t.accent.warm}>{WELCOME_ART}</text>
      </box>

      {/* 3D Egg Preview */}
      <box flexGrow={1} width="100%">
        <RegistryPreview key={selectedSpeciesId} species={species} formIndex={0} />
      </box>

      {/* Info Panel */}
      <box
        flexDirection="column"
        alignItems="center"
        width="100%"
        paddingX={4}
        paddingY={1}
        height={9}
      >
        {mode === "welcome" && (
          <>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={t.text.dim}>{"<  "}</text>
              <text><strong fg={t.text.primary}>{speciesName}</strong></text>
              <text fg={t.text.dim}>{"  >"}</text>
            </box>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={getRarityColor(species?.rarity ?? "common")}>
                {species?.rarity}
              </text>
            </box>
            <box height={1} />
            <text fg={t.text.muted}>{description}</text>
            <box flexGrow={1} />
            <text fg={t.text.dim}>
              {"<- -> browse species    ENTER select"}
            </text>
          </>
        )}

        {mode === "new-egg" && canClaim && (
          <>
            <text fg={getRarityColor(randomSpecies?.rarity ?? "common")}>
              {newEggHeader}
            </text>
            <box height={1} />
            <text fg={t.text.muted}>{description}</text>
            <box flexGrow={1} />
            <text fg={t.text.dim}>ENTER confirm    ESC cancel</text>
          </>
        )}

        {mode === "new-egg" && !canClaim && (
          <>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={t.text.dim}>{"<  "}</text>
              <text><strong fg={t.text.primary}>{speciesName}</strong></text>
              <text fg={t.text.dim}>{"  >"}</text>
            </box>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={getRarityColor(species?.rarity ?? "common")}>
                {species?.rarity}
              </text>
            </box>
            <box height={1} />
            <text fg={t.text.muted}>
              {formatXp(xpRemaining)} XP until next egg ({formatXp(totalXp)} / {formatXp(nextSlotXp)})
            </text>
            <box flexGrow={1} />
            <text fg={t.text.dim}>
              {"<- -> browse species    ESC back"}
            </text>
          </>
        )}
      </box>
    </box>
  );
}
