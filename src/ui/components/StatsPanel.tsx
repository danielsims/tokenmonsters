import { useMemo } from "react";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";
import { getLevel, getLevelProgress, getXpForNextLevel } from "../../models/level";
import { t } from "../theme";

function StatBar({
  label,
  value,
  max,
  width = 20,
}: {
  label: string;
  value: number;
  max: number;
  width?: number;
}) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

  // Neutral by default — color only signals danger
  let barColor = t.text.secondary;
  if (value < 25) barColor = t.status.error;
  else if (value < 50) barColor = t.status.warning;

  return (
    <box flexDirection="row" gap={1}>
      <text fg={t.text.muted}>{label.padEnd(10)}</text>
      <text fg={barColor}>{bar}</text>
      <text fg={t.text.muted}> {String(value).padStart(3)}/{max}</text>
    </box>
  );
}

export function StatsPanel() {
  const { monster, species } = useGame();

  if (!monster || !species) return null;

  const level = useMemo(() => getLevel(monster.experience), [monster.experience]);
  const levelProgress = useMemo(() => getLevelProgress(monster.experience), [monster.experience]);
  const nextLevelXp = useMemo(() => getXpForNextLevel(level), [level]);
  const currentForm = useMemo(() => getCurrentForm(species, monster.stage), [species, monster.stage]);

  const isEgg = monster.stage === "egg";
  const hatchXp = currentForm?.hatchXp;
  const evolvesAt = currentForm?.evolvesAtLevel;

  if (isEgg) {
    // Eggs: show XP progress toward hatching, no levels
    const target = hatchXp ?? 50_000_000;
    const hatchProgress = Math.min(100, (monster.experience / target) * 100);
    const filled = Math.round(hatchProgress / 5);

    return (
      <box flexDirection="column" gap={0} paddingX={1}>
        <StatBar label="Hunger" value={monster.hunger} max={100} />
        <text fg={t.text.hidden}>{"─".repeat(34)}</text>
        <StatBar label="Happiness" value={monster.happiness} max={100} />
        <text fg={t.text.hidden}>{"─".repeat(34)}</text>
        <StatBar label="Energy" value={monster.energy} max={100} />
        <box height={1} />
        <box flexDirection="row" gap={1}>
          <text fg={t.text.muted}>{"Hatching".padEnd(10)}</text>
          <text fg={t.accent.primary}>
            {"\u2588".repeat(filled)}
            {"\u2591".repeat(20 - filled)}
            {" "}
            {Math.round(hatchProgress)}%
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={t.text.muted}>{"XP".padEnd(10)}</text>
          <text fg={t.text.secondary}>
            {monster.experience.toLocaleString()} / {target.toLocaleString()}
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={0} paddingX={1}>
      <StatBar label="Hunger" value={monster.hunger} max={100} />
      <text fg={t.text.hidden}>{"─".repeat(34)}</text>
      <StatBar label="Happiness" value={monster.happiness} max={100} />
      <text fg={t.text.hidden}>{"─".repeat(34)}</text>
      <StatBar label="Energy" value={monster.energy} max={100} />
      <box height={1} />
      <box flexDirection="row" gap={1}>
        <text fg={t.text.muted}>{"Level".padEnd(10)}</text>
        <text fg={t.accent.primary}>
          Lv.{level}
          {"  "}
          {"\u2588".repeat(Math.round(levelProgress / 5))}
          {"\u2591".repeat(20 - Math.round(levelProgress / 5))}
          {" "}
          {Math.round(levelProgress)}%
        </text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={t.text.muted}>{"XP".padEnd(10)}</text>
        <text fg={t.text.secondary}>
          {monster.experience.toLocaleString()}
          {level < 100 ? ` / ${nextLevelXp.toLocaleString()}` : " (MAX)"}
        </text>
      </box>
      {evolvesAt !== null && evolvesAt !== undefined && (
        <box flexDirection="row" gap={1}>
          <text fg={t.text.muted}>{"Evolves".padEnd(10)}</text>
          <text fg={t.accent.primary}>Lv.{evolvesAt}</text>
        </box>
      )}
    </box>
  );
}
