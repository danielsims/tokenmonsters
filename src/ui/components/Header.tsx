import { useGame } from "../../game/context";
import { getCurrentForm, getDisplayName } from "../../models/evolution";
import { getLevel } from "../../models/level";
import { t } from "../theme";

export function Header() {
  const { monster, species, evolutionPending, isEvolving, evolutionFromStage } = useGame();

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

  // During pending/evolving, show the PRE-evolution form (monster already evolved in state)
  const maskedStage = (evolutionPending || isEvolving) && evolutionFromStage
    ? evolutionFromStage
    : monster.stage;
  const form = getCurrentForm(species, maskedStage);
  const formName = form?.name ?? maskedStage;
  const displayName = monster.name
    ? `${monster.name.charAt(0).toUpperCase() + monster.name.slice(1)} the ${formName}`
    : formName;
  const level = getLevel(monster.experience);

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
        <text fg={t.text.secondary}>{formName}</text>
      </box>
    </box>
  );
}
