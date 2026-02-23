import { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { MonsterScene } from "../components/MonsterScene";
import { StatsPanel } from "../components/StatsPanel";
import { TokenTicker } from "../components/TokenTicker";
import { StatusBar } from "../components/StatusBar";
import { t } from "../theme";

/** Below this column count, switch to stacked layout */
const COMPACT_BREAKPOINT = 150;

function useTerminalWidth(): number {
  const [width, setWidth] = useState(process.stdout.columns ?? 120);

  useEffect(() => {
    const onResize = () => setWidth(process.stdout.columns ?? 120);
    process.stdout.on("resize", onResize);
    return () => { process.stdout.off("resize", onResize); };
  }, []);

  return width;
}

export function HomeScreen() {
  const cols = useTerminalWidth();
  const compact = cols < COMPACT_BREAKPOINT;

  if (compact) {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <Header />
        <box flexGrow={1} flexDirection="column">
          <MonsterScene />
        </box>
        <box
          flexDirection="row"
          borderStyle="rounded"
          border
          borderColor={t.border.muted}
          backgroundColor={t.bg.surface}
        >
          <box flexGrow={1} flexDirection="column" paddingX={1}>
            <text fg={t.text.muted}><u>Stats</u></text>
            <StatsPanel />
          </box>
          <box flexGrow={1} flexDirection="column" paddingX={1}>
            <TokenTicker />
          </box>
        </box>
        <StatusBar />
      </box>
    );
  }

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
          borderColor={t.border.muted}
          backgroundColor={t.bg.surface}
        >
          <box paddingX={1} paddingY={0}>
            <text fg={t.text.muted}>
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
