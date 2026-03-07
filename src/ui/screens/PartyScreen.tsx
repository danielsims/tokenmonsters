import { useState, useMemo } from "react";
import { useKeyboard } from "@opentui/react";
import { getAllMonsters, getSpeciesById, updateMonster } from "../../db/queries";
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

type Mode = "list" | "naming";

interface PartyEntry {
  monster: Monster;
  species: Species;
  formName: string;
  level: number;
  formIndex: number;
}

export function PartyScreen({ onSwitch }: { onSwitch?: () => void }) {
  const { monster: activeMonster, switchMonster, refresh } = useGame();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [nameInput, setNameInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMonster?.id, refreshKey]);

  const emptySlots = PARTY_MAX - entries.length;
  const maxIndex = entries.length - 1;
  const selected = entries[selectedIndex] ?? null;

  useKeyboard((key) => {
    if (mode === "list") {
      if (key.name === "up") setSelectedIndex((i) => Math.max(0, i - 1));
      if (key.name === "down") setSelectedIndex((i) => Math.min(maxIndex, i + 1));
      if (key.name === "return" && selected) {
        switchMonster(selected.monster.id);
        onSwitch?.();
      }
      if (key.sequence === "n" && selected) {
        setNameInput(selected.monster.name ?? "");
        setMode("naming");
      }
    } else if (mode === "naming") {
      if (key.name === "escape") {
        setMode("list");
      } else if (key.name === "return") {
        if (selected) {
          const updated = { ...selected.monster, name: nameInput.trim() || null };
          updateMonster(updated);
          refresh();
          setRefreshKey((k) => k + 1);
        }
        setMode("list");
      } else if (key.name === "backspace" || key.name === "delete") {
        setNameInput((v) => v.slice(0, -1));
      } else if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
        if (nameInput.length < 20) {
          setNameInput((v) => v + key.sequence);
        }
      }
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
            const nickname = entry.monster.name ? ` "${entry.monster.name}"` : "";

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
                  {cursor}{entry.formName}{nickname}{activeTag}
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
                key={selected.monster.id}
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
            height={12}
            flexDirection="column"
            borderStyle="rounded"
            border
            borderColor={t.border.muted}
            backgroundColor={t.bg.surface}
            paddingX={2}
            paddingY={1}
          >
            {mode === "naming" && selected ? (
              <box flexDirection="column">
                <text fg={t.text.primary}>Nickname for {selected.formName}</text>
                <box height={1} />
                <text fg={nameInput.length > 0 ? t.accent.primary : t.text.dim}>
                  {nameInput.length > 0 ? nameInput : "Enter nickname..."}
                  <span fg={t.accent.primary}>_</span>
                </text>
                <box flexGrow={1} />
                <text fg={t.text.dim}>ENTER save    ESC cancel    (empty to clear)</text>
              </box>
            ) : selected ? (
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
        {entry.monster.name && <span fg={t.text.muted}> "{entry.monster.name}"</span>}
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
      <box flexGrow={1} />
      <text fg={t.text.dim}>
        {!isActive ? "[Enter] make active  " : ""}[n] nickname
      </text>
    </box>
  );
}
