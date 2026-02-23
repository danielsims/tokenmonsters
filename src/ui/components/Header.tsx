import { useGame } from "../../game/context";
import { getCurrentForm, getDisplayName } from "../../models/evolution";
import { getLevel } from "../../models/level";
import { t } from "../theme";

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
        borderColor={t.border.muted}
        backgroundColor={t.bg.base}
      >
        <text fg={t.text.dim}>No monster</text>
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
      borderColor={t.border.muted}
      backgroundColor={t.bg.base}
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <text>
          <strong fg={t.text.primary}>{displayName}</strong>
        </text>
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={t.accent.primary}>Lv.{level}</text>
        <text fg={t.text.secondary}>{form?.name ?? monster.stage}</text>
      </box>
    </box>
  );
}
