import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { TokenEvent } from "../types";

const SESSIONS_DIR = join(homedir(), ".codex", "sessions");

const processedFiles = new Set<string>();

/** Scan for new Codex session JSONL files and extract token data */
export function pollCodex(): TokenEvent[] {
  if (!existsSync(SESSIONS_DIR)) return [];

  const events: TokenEvent[] = [];

  try {
    // Walk YYYY/MM/DD directory structure
    const years = readdirSync(SESSIONS_DIR).filter((f) => /^\d{4}$/.test(f));
    for (const year of years) {
      const yearPath = join(SESSIONS_DIR, year);
      const months = safeReadDir(yearPath).filter((f) => /^\d{2}$/.test(f));
      for (const month of months) {
        const monthPath = join(yearPath, month);
        const days = safeReadDir(monthPath).filter((f) => /^\d{2}$/.test(f));
        for (const day of days) {
          const dayPath = join(monthPath, day);
          const files = safeReadDir(dayPath).filter((f) => f.startsWith("rollout-") && f.endsWith(".jsonl"));
          for (const file of files) {
            const filePath = join(dayPath, file);
            if (processedFiles.has(filePath)) continue;
            processedFiles.add(filePath);

            const event = parseCodexSession(filePath);
            if (event) events.push(event);
          }
        }
      }
    }
  } catch {
    // Silently handle read errors
  }

  return events;
}

function parseCodexSession(filePath: string): TokenEvent | null {
  try {
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    let inputTokens = 0;
    let outputTokens = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "response" && entry.payload?.usage) {
          inputTokens += entry.payload.usage.input_tokens ?? 0;
          outputTokens += entry.payload.usage.output_tokens ?? 0;
        }
      } catch {
        continue;
      }
    }

    if (inputTokens === 0 && outputTokens === 0) return null;

    return {
      source: "codex",
      inputTokens,
      outputTokens,
      cacheTokens: 0,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

function safeReadDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function isCodexAvailable(): boolean {
  return existsSync(SESSIONS_DIR);
}
