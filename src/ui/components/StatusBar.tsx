import { useGame } from "../../game/context";
import { getSetting } from "../../db/queries";
import { t, getThemeName } from "../theme";

export function StatusBar() {
  const { daemonConnected, evolutionPending } = useGame();
  const muted = getSetting("sound_mute") === "on";

  const connStatus = daemonConnected
    ? ">> Daemon connected"
    : "-- Daemon offline";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={2}
      height={1}
      backgroundColor={t.bg.base}
    >
      <text fg={t.text.dim}>
        [i] Info  [p] Party  [r] Registry  [t] Theme  [m] {muted ? "Unmute" : "Mute"}  [q] Quit
      </text>
      <box flexDirection="row" gap={2}>
        {evolutionPending && (
          <text fg={t.stat.evolve}>Evolution pending...</text>
        )}
        <text fg={t.text.dim}>{getThemeName()}</text>
        <text fg={daemonConnected ? t.status.ok : t.status.error}>
          {connStatus}
        </text>
      </box>
    </box>
  );
}
