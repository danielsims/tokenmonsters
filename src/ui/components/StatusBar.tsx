import { useGame } from "../../game/context";

export function StatusBar() {
  const { daemonConnected } = useGame();

  const connStatus = daemonConnected
    ? "\u{1f7e2} Daemon connected"
    : "\u{1f534} Daemon offline";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={2}
      height={1}
      backgroundColor="#0d0d1a"
    >
      <text fg="#555577">
        [i] Info  [q] Quit
      </text>
      <text fg={daemonConnected ? "#44aa44" : "#aa4444"}>
        {connStatus}
      </text>
    </box>
  );
}
