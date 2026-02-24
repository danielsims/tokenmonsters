import { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { MonsterScene } from "../components/MonsterScene";
import { StatsPanel } from "../components/StatsPanel";
import { TokenTicker } from "../components/TokenTicker";
import { StatusBar } from "../components/StatusBar";
import { t } from "../theme";

/** Below this column count, switch to stacked layout */
const COMPACT_BREAKPOINT = 150;
/** Below this column count, stack stats/feeds vertically */
const NARROW_BREAKPOINT = 80;

function useTerminalSize(): { cols: number; rows: number } {
  const [size, setSize] = useState({
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 40,
  });

  useEffect(() => {
    const onResize = () =>
      setSize({ cols: process.stdout.columns ?? 120, rows: process.stdout.rows ?? 40 });
    process.stdout.on("resize", onResize);
    return () => { process.stdout.off("resize", onResize); };
  }, []);

  return size;
}

export function HomeScreen() {
  const { cols } = useTerminalSize();
  const compact = cols < COMPACT_BREAKPOINT;
  const narrow = cols < NARROW_BREAKPOINT;

  if (narrow) {
    // Very narrow: stats and feeds stacked vertically, scene and panel split space
    return (
      <box flexDirection="column" width="100%" height="100%">
        <Header />
        <box flexGrow={1} flexDirection="column">
          <MonsterScene />
        </box>
        <box
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor={t.border.muted}
          backgroundColor={t.bg.surface}
        >
          <box flexDirection="column" paddingX={1}>
            <text fg={t.text.muted}><u>Stats</u></text>
            <StatsPanel />
          </box>
          <box flexDirection="column" paddingX={1}>
            <TokenTicker />
          </box>
        </box>
        <StatusBar />
      </box>
    );
  }

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
        <box flexGrow={1} flexDirection="column">
          <MonsterScene />
        </box>
        {/* Right: Stats + Ticker */}
        <box
          width={44}
          flexShrink={0}
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
