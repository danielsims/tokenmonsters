import { useState, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import { getAllMonsters, getSpeciesById } from "../../db/queries";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";
import { getLevel } from "../../models/level";
import { RegistryPreview } from "../components/RegistryPreview";
import { StatusBar } from "../components/StatusBar";
import { PARTY_MAX } from "../../db/queries";
import type { Monster, Species, Stage } from "../../models/types";
import { t } from "../theme";

const LIST_WIDTH = 34;

const STAGE_LABELS: Record<Stage, string> = {
  egg: "Egg",
  hatchling: "Hatchling",
  prime: "Prime",
  apex: "Apex",
};

interface PartyEntry {
  monster: Monster;
  species: Species;
  formName: string;
  level: number;
  formIndex: number;
}

export function PartyScreen({ onSwitch }: { onSwitch?: () => void }) {
  const { monster: activeMonster, switchMonster } = useGame();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const entries = useMemo(() => {
    const monsters = getAllMonsters();
    const list: PartyEntry[] = [];
    for (const m of monsters) {
      const sp = getSpeciesById(m.speciesId);
      if (!sp) continue;
      const form = getCurrentForm(sp, m.stage);
      const formName = form?.name ?? m.stage;
      const level = getLevel(m.experience);
      const formIndex = sp.forms.findIndex((f) => f.stage === m.stage);
      list.push({ monster: m, species: sp, formName, level, formIndex: Math.max(0, formIndex) });
    }
    return list;
  }, [activeMonster?.id]);

  const selected = entries[selectedIndex] ?? null;

  useKeyboard((key) => {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(entries.length - 1, i + 1));
    }
    if (key.name === "return" && selected) {
      switchMonster(selected.monster.id);
      onSwitch?.();
    }
  });

  // Empty slots
  const emptySlots = PARTY_MAX - entries.length;

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
        borderColor={t.border.muted}
        backgroundColor={t.bg.base}
      >
        <text>
          <strong fg={t.text.primary}>Party</strong>
          <span fg={t.text.dim}>  {entries.length}/{PARTY_MAX}</span>
        </text>
      </box>

      {/* Main content */}
      <box flexDirection="row" flexGrow={1}>
        {/* Left: Monster list */}
        <box
          width={LIST_WIDTH}
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor={t.border.muted}
          backgroundColor={t.bg.surface}
          overflow="hidden"
        >
          {entries.map((entry, i) => {
            const isSel = i === selectedIndex;
            const isActive = entry.monster.id === activeMonster?.id;
            const cursor = isSel ? "> " : "  ";
            const activeTag = isActive ? " *" : "";

            return (
              <box
                key={entry.monster.id}
                flexDirection="row"
                justifyContent="space-between"
                paddingX={1}
                height={1}
                backgroundColor={isSel ? t.bg.overlay : undefined}
              >
                <text fg={isActive ? t.accent.primary : (isSel ? t.text.primary : t.text.muted)}>
                  {cursor}{entry.formName}{activeTag}
                </text>
                <text fg={t.text.dim}>Lv.{entry.level}</text>
              </box>
            );
          })}
          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <box key={`empty-${i}`} paddingX={1} height={1}>
              <text fg={t.text.hidden}>  ---</text>
            </box>
          ))}
        </box>

        {/* Right: Preview + Details */}
        <box flexGrow={1} flexDirection="column">
          {/* 3D Preview */}
          <box flexGrow={1}>
            {selected ? (
              <RegistryPreview
                species={selected.species}
                formIndex={selected.formIndex}
                locked={false}
              />
            ) : (
              <box
                justifyContent="center"
                alignItems="center"
                flexGrow={1}
                backgroundColor={t.bg.surface}
              >
                <text fg={t.text.hidden}>No monsters</text>
              </box>
            )}
          </box>

          {/* Detail panel */}
          <box
            height={10}
            flexDirection="column"
            borderStyle="rounded"
            border
            borderColor={t.border.muted}
            backgroundColor={t.bg.surface}
            paddingX={2}
            paddingY={1}
          >
            {selected ? (
              <MonsterDetail entry={selected} isActive={selected.monster.id === activeMonster?.id} />
            ) : (
              <text fg={t.text.hidden}>No monster selected.</text>
            )}
          </box>
        </box>
      </box>

      <StatusBar />
    </box>
  );
}

function MonsterDetail({ entry, isActive }: { entry: PartyEntry; isActive: boolean }) {
  const form = getCurrentForm(entry.species, entry.monster.stage);
  const created = new Date(entry.monster.createdAt);
  const dateStr = created.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <box flexDirection="column">
      <text>
        <strong fg={t.text.primary}>{entry.formName}</strong>
        {"  "}
        <span fg={t.accent.primary}>Lv.{entry.level}</span>
        {isActive && <span fg={t.accent.primary}> [Active]</span>}
      </text>
      <text fg={t.text.muted}>
        {form?.description ?? ""}
      </text>
      <box height={1} />
      <text fg={t.text.dim}>
        {STAGE_LABELS[entry.monster.stage]} stage  |  Origin: {entry.monster.origin}  |  {dateStr}
      </text>
      {entry.monster.name && (
        <text fg={t.text.dim}>Name: {entry.monster.name}</text>
      )}
      {!isActive && (
        <text fg={t.text.dim}>[Enter] to make active</text>
      )}
    </box>
  );
}
