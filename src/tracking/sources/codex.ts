import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { TokenEvent } from "../types";

const SESSIONS_DIR = join(homedir(), ".codex", "sessions");

// Track file sizes for delta-based polling (same approach as claude.ts)
const fileSizes = new Map<string, number>();
let initialized = false;

export interface CodexTokens {
  input: number;
  output: number;
  cache: number;
}

/** Sanitize a token count: must be a non-negative finite number */
function safeToken(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

/** Parse a single Codex JSONL line into token counts, or null if not a token_count event */
export function parseCodexLine(line: string): CodexTokens | null {
  if (!line || !line.trim()) return null;
  try {
    const entry = JSON.parse(line);
    if (entry.type !== "event_msg" || entry.payload?.type !== "token_count") return null;
    const usage = entry.payload.info?.last_token_usage;
    if (!usage || typeof usage !== "object") return null;
    return {
      input: safeToken(usage.input_tokens),
      output: safeToken(usage.output_tokens) + safeToken(usage.reasoning_output_tokens),
      cache: safeToken(usage.cached_input_tokens),
    };
  } catch {
    return null;
  }
}

/** Find recently-active Codex session JSONL files (modified in last 10 min) */
function getSessionFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(SESSIONS_DIR)) return files;

  const cutoff = Date.now() - 10 * 60 * 1000;

  try {
    const years = readdirSync(SESSIONS_DIR).filter((f) => /^\d{4}$/.test(f));
    for (const year of years) {
      const yearPath = join(SESSIONS_DIR, year);
      const months = safeReadDir(yearPath).filter((f) => /^\d{2}$/.test(f));
      for (const month of months) {
        const monthPath = join(yearPath, month);
        const days = safeReadDir(monthPath).filter((f) => /^\d{2}$/.test(f));
        for (const day of days) {
          const dayPath = join(monthPath, day);
          const entries = safeReadDir(dayPath).filter((f) => f.startsWith("rollout-") && f.endsWith(".jsonl"));
          for (const entry of entries) {
            const fp = join(dayPath, entry);
            try {
              const fStat = statSync(fp);
              if (fStat.mtimeMs >= cutoff) files.push(fp);
            } catch { continue; }
          }
        }
      }
    }
  } catch {}

  return files;
}

/** Read only new bytes from a file since our last read position */
function parseNewLines(filePath: string): { input: number; output: number; cache: number }[] {
  const results: { input: number; output: number; cache: number }[] = [];

  try {
    const stat = statSync(filePath);
    const currentSize = stat.size;
    // New files: read from start — short sessions may complete between polls
    const lastSize = fileSizes.get(filePath) ?? 0;

    if (currentSize <= lastSize) {
      fileSizes.set(filePath, currentSize);
      return results;
    }

    const { openSync, readSync, closeSync } = require("fs");
    const bytesToRead = currentSize - lastSize;
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(filePath, "r");
    readSync(fd, buffer, 0, bytesToRead, lastSize);
    closeSync(fd);
    const newContent = buffer.toString("utf-8");
    fileSizes.set(filePath, currentSize);

    const lines = newContent.trim().split("\n");
    for (const line of lines) {
      const tokens = parseCodexLine(line);
      if (tokens) results.push(tokens);
    }
  } catch {}

  return results;
}

/** Poll for new token usage from Codex session JSONL files */
export function pollCodex(): TokenEvent[] {
  const files = getSessionFiles();

  if (!initialized) {
    for (const file of files) {
      try {
        const stat = statSync(file);
        fileSizes.set(file, stat.size);
      } catch {}
    }
    initialized = true;
    return [];
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCache = 0;

  for (const file of files) {
    const usages = parseNewLines(file);
    for (const u of usages) {
      totalInput += u.input;
      totalOutput += u.output;
      totalCache += u.cache;
    }
  }

  if (totalInput === 0 && totalOutput === 0 && totalCache === 0) return [];

  return [{
    source: "codex",
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheTokens: totalCache,
    timestamp: Date.now(),
  }];
}

function safeReadDir(path: string): string[] {
  try { return readdirSync(path); } catch { return []; }
}

export function isCodexAvailable(): boolean {
  return existsSync(SESSIONS_DIR);
}
