import { useState, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import { getAllSpecies, getOwnedSpeciesStages } from "../../db/queries";
import { RegistryPreview } from "../components/RegistryPreview";
import { StatusBar } from "../components/StatusBar";
import type { Species, Rarity, EvolutionForm, Stage } from "../../models/types";

const RARITY_COLORS: Record<Rarity, string> = {
  common: "#aaaaaa",
  uncommon: "#44bb88",
  rare: "#cc8844",
  legendary: "#dd55dd",
};

const RARITY_LABELS: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

const LIST_WIDTH = 28;

const STAGE_ORDER: Stage[] = ["egg", "hatchling", "prime", "apex"];

interface FlatEntry {
  species: Species;
  formIndex: number;
  form: EvolutionForm;
}

export function RegistryScreen() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [devShowAll, setDevShowAll] = useState(false);

  const allSpecies = useMemo(() => getAllSpecies(), []);
  const stageMap = useMemo(() => getOwnedSpeciesStages(), []);

  // Flatten: one row per form, species forms in order, species in order
  const entries = useMemo(() => {
    const list: FlatEntry[] = [];
    for (const sp of allSpecies) {
      for (let i = 0; i < sp.forms.length; i++) {
        list.push({ species: sp, formIndex: i, form: sp.forms[i] });
      }
    }
    return list;
  }, [allSpecies]);

  const selected = entries[selectedIndex] ?? null;
  const isOwned = selected ? stageMap.has(selected.species.id) : false;
  const canSee = isOwned || devShowAll;

  // Form is locked if species is owned but player hasn't reached this stage yet
  const isLocked = (entry: FlatEntry): boolean => {
    const reached = stageMap.get(entry.species.id);
    if (!reached) return false; // not owned at all — handled separately
    return STAGE_ORDER.indexOf(entry.form.stage) > STAGE_ORDER.indexOf(reached);
  };

  const selectedLocked = selected ? isLocked(selected) : false;

  useKeyboard((key) => {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(entries.length - 1, i + 1));
    }
    if (key.name === "d") {
      setDevShowAll((v) => !v);
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={2}
        height={3}
        borderStyle="rounded"
        border
        borderColor="#333355"
        backgroundColor="#0d0d1a"
      >
        <text>
          <strong fg="#ffffff">Registry</strong>
        </text>
        {devShowAll && <text fg="#ff8844">[DEV]</text>}
      </box>

      {/* Main content */}
      <box flexDirection="row" flexGrow={1}>
        {/* Left: Flat form list */}
        <box
          width={LIST_WIDTH}
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor="#222244"
          backgroundColor="#0a0a15"
          overflow="hidden"
        >
          {entries.map((entry, i) => {
            const owned = stageMap.has(entry.species.id);
            const visible = owned || devShowAll;
            const locked = owned && isLocked(entry) && !devShowAll;
            const isSel = i === selectedIndex;
            const cursor = isSel ? "> " : "  ";
            const name = visible ? entry.form.name : "???";
            const rarityLabel = RARITY_LABELS[entry.species.rarity];

            let nameColor: string;
            if (!visible) {
              nameColor = "#444455";
            } else if (locked) {
              nameColor = isSel ? "#666677" : "#444455";
            } else {
              nameColor = isSel ? "#ffffff" : "#888899";
            }
            const rarityColor = visible ? RARITY_COLORS[entry.species.rarity] : "#333344";

            return (
              <box
                key={`${entry.species.id}-${entry.formIndex}`}
                flexDirection="row"
                justifyContent="space-between"
                paddingX={1}
                height={1}
                backgroundColor={isSel ? "#1a1a2e" : undefined}
              >
                <text fg={nameColor}>
                  {cursor}{name}
                </text>
                <text fg={locked ? "#333344" : rarityColor}>{rarityLabel}</text>
              </box>
            );
          })}
        </box>

        {/* Right: Preview + Details */}
        <box flexGrow={1} flexDirection="column">
          {/* 3D Preview */}
          <box flexGrow={1}>
            {canSee && selected ? (
              <RegistryPreview
                species={selected.species}
                formIndex={selected.formIndex}
                locked={selectedLocked && !devShowAll}
              />
            ) : (
              <box
                justifyContent="center"
                alignItems="center"
                flexGrow={1}
                backgroundColor="#0a0a12"
              >
                <text fg="#333344">???</text>
              </box>
            )}
          </box>

          {/* Detail panel */}
          <box
            height={10}
            flexDirection="column"
            borderStyle="rounded"
            border
            borderColor="#222244"
            backgroundColor="#0a0a15"
            paddingX={2}
            paddingY={1}
          >
            {canSee && selected ? (
              <FormDetail
                species={selected.species}
                form={selected.form}
                locked={selectedLocked && !devShowAll}
              />
            ) : (
              <box flexDirection="column">
                <text fg="#444455">???</text>
                <text fg="#333344">Species not yet discovered.</text>
              </box>
            )}
          </box>
        </box>
      </box>

      <StatusBar />
    </box>
  );
}

function FormDetail({
  species,
  form,
  locked,
}: {
  species: Species;
  form: EvolutionForm;
  locked: boolean;
}) {
  return (
    <box flexDirection="column">
      <text>
        <strong fg={locked ? "#444455" : "#ffffff"}>{form.name}</strong>
        {"  "}
        <span fg={locked ? "#333344" : RARITY_COLORS[species.rarity]}>
          {RARITY_LABELS[species.rarity]}
        </span>
      </text>
      <text fg={locked ? "#333344" : "#888899"}>
        {locked ? "Not yet evolved." : species.description}
      </text>
      {!locked && (
        <>
          <box height={1} />
          <text fg="#777799">{form.description}</text>
        </>
      )}
    </box>
  );
}
