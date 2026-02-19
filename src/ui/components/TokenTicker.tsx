import { useGame } from "../../game/context";
import type { TokenSource } from "../../models/types";

const SOURCE_COLORS: Record<TokenSource, string> = {
  claude: "#ff8844",
  codex: "#44bbff",
  opencode: "#44ff88",
};

const SOURCE_LABELS: Record<TokenSource, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TokenTicker() {
  const { recentFeeds } = useGame();

  if (recentFeeds.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="#555555">No token feeds yet. Use an AI tool to feed your monster!</text>
      </box>
    );
  }

  // Show most recent 8 feeds
  const visible = recentFeeds.slice(0, 8);

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg="#888888">
        <u>Recent Feeds</u>
      </text>
      {visible.map((feed, i) => {
        const total = feed.inputTokens + feed.outputTokens + feed.cacheTokens;
        const color = SOURCE_COLORS[feed.source];
        const label = SOURCE_LABELS[feed.source];
        return (
          <text key={feed.id ?? i}>
            <span fg="#555555">{formatTime(feed.fedAt)} </span>
            <span fg={color}>{label.padEnd(8)}</span>
            <span fg="#aaaaaa"> +{formatTokens(total)} tokens</span>
          </text>
        );
      })}
    </box>
  );
}
