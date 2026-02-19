import { useMemo } from "react";
import { useGame } from "../../game/context";
import { getEvolutionProgress, getNextThreshold } from "../../models/evolution";

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

  const progress = useMemo(
    () => getEvolutionProgress(monster, species.evolutionThresholds),
    [monster.experience, monster.stage, species.evolutionThresholds]
  );

  const nextThreshold = getNextThreshold(monster.stage, species.evolutionThresholds);

  return (
    <box flexDirection="column" gap={0} paddingX={1}>
      <StatBar label="Hunger" value={monster.hunger} max={100} color="#44ff44" />
      <StatBar label="Happiness" value={monster.happiness} max={100} color="#ff44ff" />
      <StatBar label="Energy" value={monster.energy} max={100} color="#4488ff" />
      <box flexDirection="row" gap={1}>
        <text fg="#888888">{"XP".padEnd(10)}</text>
        <text fg="#ffdd44">
          {monster.experience.toLocaleString()}
          {nextThreshold ? ` / ${nextThreshold.toLocaleString()}` : " (MAX)"}
        </text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg="#888888">{"Evolution".padEnd(10)}</text>
        <text fg="#ffdd44">
          {"\u2588".repeat(Math.round(progress / 5))}
          {"\u2591".repeat(20 - Math.round(progress / 5))}
          {" "}
          {Math.round(progress)}%
        </text>
      </box>
    </box>
  );
}
