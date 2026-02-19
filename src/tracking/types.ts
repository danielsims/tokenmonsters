import type { TokenSource } from "../models/types";

export interface TokenEvent {
  source: TokenSource;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  timestamp: number;
}

export interface TokenTotals {
  claude: number;
  codex: number;
  opencode: number;
}

export interface DaemonHealthResponse {
  status: "ok";
  uptime: number;
  sources: {
    claude: boolean;
    codex: boolean;
    opencode: boolean;
  };
}
