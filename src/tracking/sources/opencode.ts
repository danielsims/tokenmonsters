import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { TokenEvent } from "../types";

const STORAGE_DIR = join(homedir(), ".opencode", "storage");
const SESSION_DIR = join(STORAGE_DIR, "session");
const MESSAGE_DIR = join(STORAGE_DIR, "message");

const processedSessions = new Set<string>();

/** Scan for new OpenCode session/message data */
export function pollOpenCode(): TokenEvent[] {
  if (!existsSync(SESSION_DIR)) return [];

  const events: TokenEvent[] = [];

  try {
    const sessionFiles = readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"));

    for (const file of sessionFiles) {
      const sessionId = file.replace(".json", "");
      if (processedSessions.has(sessionId)) continue;
      processedSessions.add(sessionId);

      const event = parseOpenCodeSession(sessionId);
      if (event) events.push(event);
    }
  } catch {
    // Silently handle
  }

  return events;
}

function parseOpenCodeSession(sessionId: string): TokenEvent | null {
  const msgDir = join(MESSAGE_DIR, sessionId);
  if (!existsSync(msgDir)) return null;

  try {
    const files = readdirSync(msgDir).filter((f) => f.endsWith(".json"));
    let inputTokens = 0;
    let outputTokens = 0;

    for (const file of files) {
      try {
        const raw = readFileSync(join(msgDir, file), "utf-8");
        const msg = JSON.parse(raw);
        if (msg.usage) {
          inputTokens += msg.usage.inputTokens ?? msg.usage.input_tokens ?? 0;
          outputTokens += msg.usage.outputTokens ?? msg.usage.output_tokens ?? 0;
        }
      } catch {
        continue;
      }
    }

    if (inputTokens === 0 && outputTokens === 0) return null;

    return {
      source: "opencode",
      inputTokens,
      outputTokens,
      cacheTokens: 0,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

export function isOpenCodeAvailable(): boolean {
  return existsSync(SESSION_DIR);
}
