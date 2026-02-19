import { useGame } from "../../game/context";

const STAGE_BADGES: Record<string, string> = {
  egg: "\u{1f95a} Egg",
  hatchling: "\u{1f423} Hatchling",
  juvenile: "\u{1f425} Juvenile",
  adult: "\u{1f409} Adult",
  elder: "\u2b50 Elder",
};

export function Header() {
  const { monster, species } = useGame();

  const name = monster?.name ?? "???";
  const stage = monster?.stage ? STAGE_BADGES[monster.stage] ?? monster.stage : "";
  const speciesName = species?.name ?? "";

  return (
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
      <box flexDirection="row" gap={2} alignItems="center">
        <text>
          <strong fg="#ffffff">{name}</strong>
        </text>
        {speciesName ? (
          <text fg="#666688">({speciesName})</text>
        ) : null}
      </box>
      <box alignItems="center">
        <text fg="#aaaacc">{stage}</text>
      </box>
    </box>
  );
}
