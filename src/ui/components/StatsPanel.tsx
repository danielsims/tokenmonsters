import { useMemo } from "react";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";
import { getLevel, getLevelProgress, getXpForNextLevel } from "../../models/level";

function StatBar({
  label,
  value,
  max,
  color,
  width = 20,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  width?: number;
}) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

  // Color changes as value drops
  let barColor = color;
  if (value < 25) barColor = "#ff4444";
  else if (value < 50) barColor = "#ffaa00";

  return (
    <box flexDirection="row" gap={1}>
      <text fg="#888888">{label.padEnd(10)}</text>
      <text fg={barColor}>{bar}</text>
      <text fg="#aaaaaa"> {String(value).padStart(3)}/{max}</text>
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

  const evolvesAt = currentForm?.evolvesAtLevel;

  return (
    <box flexDirection="column" gap={0} paddingX={1}>
      <StatBar label="Hunger" value={monster.hunger} max={100} color="#44ff44" />
      <StatBar label="Happiness" value={monster.happiness} max={100} color="#ff44ff" />
      <StatBar label="Energy" value={monster.energy} max={100} color="#4488ff" />
      <box flexDirection="row" gap={1}>
        <text fg="#888888">{"Level".padEnd(10)}</text>
        <text fg="#ffdd44">
          Lv.{level}
          {"  "}
          {"\u2588".repeat(Math.round(levelProgress / 5))}
          {"\u2591".repeat(20 - Math.round(levelProgress / 5))}
          {" "}
          {Math.round(levelProgress)}%
        </text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg="#888888">{"XP".padEnd(10)}</text>
        <text fg="#aaaacc">
          {monster.experience.toLocaleString()}
          {level < 100 ? ` / ${nextLevelXp.toLocaleString()}` : " (MAX)"}
        </text>
      </box>
      {evolvesAt !== null && evolvesAt !== undefined && (
        <box flexDirection="row" gap={1}>
          <text fg="#888888">{"Evolves".padEnd(10)}</text>
          <text fg="#ff88ff">Lv.{evolvesAt}</text>
        </box>
      )}
    </box>
  );
}
