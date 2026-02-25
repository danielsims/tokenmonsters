import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Database } from "bun:sqlite";
import type { TokenEvent } from "../types";

const OC_DATA = join(homedir(), ".local", "share", "opencode");
const DB_PATH = join(OC_DATA, "opencode.db");
const MSG_DIR = join(OC_DATA, "storage", "message");

// --- SQLite DB source (terminal CLI v1.2+) ---
let lastDbTime: string | null = null;
let dbInitialized = false;

function pollDb(): { input: number; output: number; cache: number } {
  const result = { input: 0, output: 0, cache: 0 };
  if (!existsSync(DB_PATH)) return result;

  let db: Database | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true });

    if (!dbInitialized) {
      const row = db.query(
        `SELECT MAX(time_created) as t FROM part WHERE json_extract(data, '$.type') = 'step-finish'`,
      ).get() as { t: string | null } | null;
      lastDbTime = row?.t ?? null;
      dbInitialized = true;
      db.close();
      return result;
    }

    if (!lastDbTime) {
      const row = db.query(
        `SELECT MAX(time_created) as t FROM part WHERE json_extract(data, '$.type') = 'step-finish'`,
      ).get() as { t: string | null } | null;
      if (!row?.t) { db.close(); return result; }
      lastDbTime = row.t;
      db.close();
      return result;
    }

    const rows = db.query(
      `SELECT time_created, json_extract(data, '$.tokens') as tokens
       FROM part
       WHERE json_extract(data, '$.type') = 'step-finish'
         AND time_created > ?
       ORDER BY time_created ASC`,
    ).all(lastDbTime) as { time_created: string; tokens: string | null }[];

    db.close();
    db = null;

    for (const row of rows) {
      if (!row.tokens) continue;
      try {
        const t = JSON.parse(row.tokens);
        result.input += t.input ?? 0;
        result.output += (t.output ?? 0) + (t.reasoning ?? 0);
        result.cache += (t.cache?.read ?? 0) + (t.cache?.write ?? 0);
      } catch { continue; }
      lastDbTime = row.time_created;
    }
  } catch {
    if (db) try { db.close(); } catch {}
  }
  return result;
}

// --- Filesystem source (GUI app v1.1+) ---
// Track by message completion timestamp to avoid init race conditions.
// Messages with time.completed > lastFsTime are new.
let lastFsTime = 0;
let fsInitialized = false;

function pollStorage(): { input: number; output: number; cache: number } {
  const result = { input: 0, output: 0, cache: 0 };
  if (!existsSync(MSG_DIR)) return result;

  try {
    const cutoff = Date.now() - 10 * 60 * 1000;
    const sessionDirs = readdirSync(MSG_DIR).filter((d) => d.startsWith("ses_"));

    let maxTime = lastFsTime;

    for (const dir of sessionDirs) {
      const dirPath = join(MSG_DIR, dir);
      try {
        const dirStat = statSync(dirPath);
        if (!dirStat.isDirectory() || dirStat.mtimeMs < cutoff) continue;
      } catch { continue; }

      const files = safeReadDir(dirPath).filter((f) => f.startsWith("msg_") && f.endsWith(".json"));
      for (const file of files) {
        const filePath = join(dirPath, file);
        try {
          const msg = JSON.parse(readFileSync(filePath, "utf-8"));
          if (msg.role !== "assistant" || !msg.tokens) continue;
          const completed = msg.time?.completed ?? 0;
          if (completed <= lastFsTime) continue;

          // On first run, just find the max timestamp
          if (!fsInitialized) {
            if (completed > maxTime) maxTime = completed;
            continue;
          }

          if (completed > maxTime) maxTime = completed;
          const t = msg.tokens;
          result.input += t.input ?? 0;
          result.output += (t.output ?? 0) + (t.reasoning ?? 0);
          result.cache += (t.cache?.read ?? 0) + (t.cache?.write ?? 0);
        } catch { continue; }
      }
    }

    lastFsTime = maxTime;
    if (!fsInitialized) fsInitialized = true;
  } catch {}
  return result;
}

/** Poll for new token usage from both OpenCode CLI (DB) and GUI (filesystem) */
export function pollOpenCode(): TokenEvent[] {
  const db = pollDb();
  const fs = pollStorage();

  const totalInput = db.input + fs.input;
  const totalOutput = db.output + fs.output;
  const totalCache = db.cache + fs.cache;

  if (totalInput === 0 && totalOutput === 0 && totalCache === 0) return [];

  return [{
    source: "opencode",
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheTokens: totalCache,
    timestamp: Date.now(),
  }];
}

function safeReadDir(path: string): string[] {
  try { return readdirSync(path); } catch { return []; }
}

export function isOpenCodeAvailable(): boolean {
  return existsSync(DB_PATH) || existsSync(MSG_DIR);
}
