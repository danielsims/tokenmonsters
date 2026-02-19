import { useGame } from "../../game/context";
import { getCurrentForm, getDisplayName } from "../../models/evolution";
import { getLevel } from "../../models/level";

export function Header() {
  const { monster, species } = useGame();

  if (!monster || !species) {
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
        <text fg="#666688">No monster</text>
      </box>
    );
  }

  const displayName = getDisplayName(monster, species);
  const level = getLevel(monster.experience);
  const form = getCurrentForm(species, monster.stage);

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
          <strong fg="#ffffff">{displayName}</strong>
        </text>
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg="#ffdd44">Lv.{level}</text>
        <text fg="#aaaacc">{form?.name ?? monster.stage}</text>
      </box>
    </box>
  );
}
