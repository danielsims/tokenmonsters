import { useGame } from "../../game/context";
import type { TokenSource } from "../../models/types";
import { t } from "../theme";

const SOURCE_COLORS: Record<TokenSource, string> = {
  claude: t.source.claude,
  codex: t.source.codex,
  opencode: t.source.opencode,
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
        <text fg={t.text.dim}>No token feeds yet. Use an AI tool to feed your monster!</text>
      </box>
    );
  }

  // Show most recent 8 feeds
  const visible = recentFeeds.slice(0, 8);

  return (
    <box flexDirection="column" paddingX={1}>
      <text fg={t.text.muted}>
        <u>Recent Feeds</u>
      </text>
      {visible.map((feed, i) => {
        const total = feed.inputTokens + feed.outputTokens + feed.cacheTokens;
        const color = SOURCE_COLORS[feed.source];
        const label = SOURCE_LABELS[feed.source];
        return (
          <text key={feed.id ?? i}>
            <span fg={t.text.dim}>{formatTime(feed.fedAt)} </span>
            <span fg={color}>{label.padEnd(8)}</span>
            <span fg={t.text.secondary}> +{formatTokens(total)} tokens</span>
          </text>
        );
      })}
    </box>
  );
}
