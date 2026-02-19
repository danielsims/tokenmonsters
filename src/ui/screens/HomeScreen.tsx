import { Header } from "../components/Header";
import { MonsterScene } from "../components/MonsterScene";
import { StatsPanel } from "../components/StatsPanel";
import { TokenTicker } from "../components/TokenTicker";
import { StatusBar } from "../components/StatusBar";

export function HomeScreen() {
  return (
    <box flexDirection="column" width="100%" height="100%">
      <Header />
      <box flexDirection="row" flexGrow={1}>
        {/* Left: Monster display */}
        <box flexGrow={2} flexDirection="column">
          <MonsterScene />
        </box>
        {/* Right: Stats + Ticker */}
        <box
          flexGrow={1}
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor="#222244"
          backgroundColor="#0a0a15"
        >
          <box paddingX={1} paddingY={0}>
            <text fg="#888888">
              <u>Stats</u>
            </text>
          </box>
          <StatsPanel />
          <box height={1} />
          <TokenTicker />
        </box>
      </box>
      <StatusBar />
    </box>
  );
}
