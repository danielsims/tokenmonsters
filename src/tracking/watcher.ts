import { pollClaude, isClaudeAvailable } from "./sources/claude";
import { pollCodex, isCodexAvailable } from "./sources/codex";
import { pollOpenCode, isOpenCodeAvailable } from "./sources/opencode";
import type { TokenEvent } from "./types";

const POLL_INTERVAL = 5_000; // 5 seconds

export class TokenWatcher {
  private events: TokenEvent[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private startedAt = Date.now();

  start(): void {
    // Initial poll
    this.poll();
    this.interval = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private poll(): void {
    // Claude — delta-based polling
    const claudeEvent = pollClaude();
    if (claudeEvent) this.events.push(claudeEvent);

    // Codex — new file scanning
    const codexEvents = pollCodex();
    this.events.push(...codexEvents);

    // OpenCode — new session scanning
    const openCodeEvents = pollOpenCode();
    this.events.push(...openCodeEvents);
  }

  /** Get and drain events since last call */
  drain(): TokenEvent[] {
    const drained = this.events.splice(0);
    return drained;
  }

  /** Get cumulative totals */
  getTotals(): { claude: number; codex: number; opencode: number } {
    const totals = { claude: 0, codex: 0, opencode: 0 };
    // We can't reconstruct from drained events, so track separately
    // For now return 0s — the DB has the real totals
    return totals;
  }

  getSourceStatus(): { claude: boolean; codex: boolean; opencode: boolean } {
    return {
      claude: isClaudeAvailable(),
      codex: isCodexAvailable(),
      opencode: isOpenCodeAvailable(),
    };
  }

  getUptime(): number {
    return Date.now() - this.startedAt;
  }
}
