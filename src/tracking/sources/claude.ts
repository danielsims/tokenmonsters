import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { TokenEvent } from "../types";

const CLAUDE_DIR = join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

// Track file sizes to detect new content
const fileSizes = new Map<string, number>();
let initialized = false;

interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Find recently-active JSONL session files (modified in last 10 min) */
function getSessionFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(PROJECTS_DIR)) return files;

  const cutoff = Date.now() - 10 * 60 * 1000; // 10 min ago

  try {
    const projects = readdirSync(PROJECTS_DIR);
    for (const project of projects) {
      const projectPath = join(PROJECTS_DIR, project);
      try {
        const dirStat = statSync(projectPath);
        if (!dirStat.isDirectory()) continue;
        const entries = readdirSync(projectPath);
        for (const entry of entries) {
          if (!entry.endsWith(".jsonl")) continue;
          const fp = join(projectPath, entry);
          try {
            const fStat = statSync(fp);
            if (fStat.mtimeMs >= cutoff) {
              files.push(fp);
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  return files;
}

/** Parse new lines from a JSONL file since our last read position */
function parseNewLines(filePath: string): UsageData[] {
  const results: UsageData[] = [];

  try {
    const stat = statSync(filePath);
    const currentSize = stat.size;
    const lastSize = fileSizes.get(filePath);

    if (lastSize === undefined) {
      // First time seeing this file — snapshot size, don't extract
      fileSizes.set(filePath, currentSize);
      return results;
    }

    if (currentSize <= lastSize) {
      fileSizes.set(filePath, currentSize);
      return results;
    }

    // Read only the new bytes using proper byte offset
    const bytesToRead = currentSize - lastSize;
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(filePath, "r");
    readSync(fd, buffer, 0, bytesToRead, lastSize);
    closeSync(fd);
    const newContent = buffer.toString("utf-8");
    fileSizes.set(filePath, currentSize);

    const lines = newContent.trim().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        // Usage lives at message.usage in Claude Code JSONL
        const usage = entry.message?.usage ?? entry.usage;
        if (usage) {
          results.push(usage);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore read errors
  }

  return results;
}

/** Poll for new token usage from Claude Code session JSONL files */
export function pollClaude(): TokenEvent | null {
  const files = getSessionFiles();

  if (!initialized) {
    // On first poll, snapshot all file sizes so we only track new data
    for (const file of files) {
      try {
        const stat = statSync(file);
        fileSizes.set(file, stat.size);
      } catch {
        // ignore
      }
    }
    initialized = true;
    return null;
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCache = 0;

  for (const file of files) {
    const usages = parseNewLines(file);
    for (const usage of usages) {
      totalInput += usage.input_tokens ?? 0;
      totalOutput += usage.output_tokens ?? 0;
      totalCache += (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    }
  }

  if (totalInput === 0 && totalOutput === 0 && totalCache === 0) return null;

  return {
    source: "claude",
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheTokens: totalCache,
    timestamp: Date.now(),
  };
}

export function isClaudeAvailable(): boolean {
  return existsSync(PROJECTS_DIR);
}
