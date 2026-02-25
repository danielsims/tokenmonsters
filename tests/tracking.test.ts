import { test, expect, describe } from "bun:test";
import { parseClaudeLine } from "../src/tracking/sources/claude";
import { parseCodexLine } from "../src/tracking/sources/codex";
import { parseOpenCodeTokens, parseOpenCodeMessage } from "../src/tracking/sources/opencode";

// ---------------------------------------------------------------------------
// Claude Parser
// ---------------------------------------------------------------------------

describe("parseClaudeLine", () => {
  test("extracts usage from message.usage", () => {
    const line = JSON.stringify({
      message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } },
    });
    const result = parseClaudeLine(line);
    expect(result).toEqual({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 });
  });

  test("extracts usage from top-level usage field", () => {
    const line = JSON.stringify({ usage: { input_tokens: 200, output_tokens: 80 } });
    const result = parseClaudeLine(line);
    expect(result!.input_tokens).toBe(200);
    expect(result!.output_tokens).toBe(80);
  });

  test("returns null for line with no usage", () => {
    expect(parseClaudeLine(JSON.stringify({ type: "text", content: "hello" }))).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseClaudeLine("{broken json")).toBeNull();
  });

  test("returns null for empty/whitespace", () => {
    expect(parseClaudeLine("")).toBeNull();
    expect(parseClaudeLine("   ")).toBeNull();
  });

  test("missing fields default to 0", () => {
    const line = JSON.stringify({ usage: { input_tokens: 100 } });
    const result = parseClaudeLine(line)!;
    expect(result.input_tokens).toBe(100);
    expect(result.output_tokens).toBe(0);
    expect(result.cache_read_input_tokens).toBe(0);
    expect(result.cache_creation_input_tokens).toBe(0);
  });

  test("rejects negative token values", () => {
    const line = JSON.stringify({ usage: { input_tokens: -500, output_tokens: 100 } });
    const result = parseClaudeLine(line)!;
    expect(result.input_tokens).toBe(0);
    expect(result.output_tokens).toBe(100);
  });

  test("rejects non-numeric token values", () => {
    const line = JSON.stringify({ usage: { input_tokens: "999999", output_tokens: { nested: true } } });
    const result = parseClaudeLine(line)!;
    // String "999999" coerces to number via Number() — this is fine, safeToken floors it
    expect(result.input_tokens).toBe(999999);
    // Object coerces to NaN
    expect(result.output_tokens).toBe(0);
  });

  test("rejects NaN and Infinity", () => {
    const line = JSON.stringify({ usage: { input_tokens: null, output_tokens: "not a number" } });
    const result = parseClaudeLine(line)!;
    expect(result.input_tokens).toBe(0);
    expect(result.output_tokens).toBe(0);
  });

  test("caps extremely large values at MAX_SAFE_INTEGER", () => {
    const line = JSON.stringify({ usage: { input_tokens: 1e20 } });
    const result = parseClaudeLine(line)!;
    expect(result.input_tokens).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("returns null when usage is a non-object", () => {
    expect(parseClaudeLine(JSON.stringify({ usage: 42 }))).toBeNull();
    expect(parseClaudeLine(JSON.stringify({ usage: "string" }))).toBeNull();
    expect(parseClaudeLine(JSON.stringify({ usage: null }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Codex Parser
// ---------------------------------------------------------------------------

describe("parseCodexLine", () => {
  test("extracts tokens from valid token_count event", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 9570, output_tokens: 45, reasoning_output_tokens: 29, cached_input_tokens: 8192 },
        },
      },
    });
    const result = parseCodexLine(line)!;
    expect(result.input).toBe(9570);
    expect(result.output).toBe(45 + 29);
    expect(result.cache).toBe(8192);
  });

  test("returns null for event_msg with null info", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: null },
    });
    expect(parseCodexLine(line)).toBeNull();
  });

  test("returns null for wrong type", () => {
    const line = JSON.stringify({ type: "session_meta", payload: {} });
    expect(parseCodexLine(line)).toBeNull();
  });

  test("returns null for wrong payload type", () => {
    const line = JSON.stringify({ type: "event_msg", payload: { type: "rate_limit" } });
    expect(parseCodexLine(line)).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseCodexLine("not json at all")).toBeNull();
  });

  test("returns null for empty/whitespace", () => {
    expect(parseCodexLine("")).toBeNull();
    expect(parseCodexLine("  \n  ")).toBeNull();
  });

  test("missing usage fields default to 0", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100 } } },
    });
    const result = parseCodexLine(line)!;
    expect(result.input).toBe(100);
    expect(result.output).toBe(0);
    expect(result.cache).toBe(0);
  });

  test("rejects negative values", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: -1000, output_tokens: 50 } } },
    });
    const result = parseCodexLine(line)!;
    expect(result.input).toBe(0);
    expect(result.output).toBe(50);
  });

  test("rejects non-numeric values", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: [1, 2, 3], output_tokens: true } } },
    });
    const result = parseCodexLine(line)!;
    expect(result.input).toBe(0);
    // true coerces to 1 via Number()
    expect(result.output).toBe(1);
  });

  test("caps extremely large values", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1e18 } } },
    });
    const result = parseCodexLine(line)!;
    expect(result.input).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ---------------------------------------------------------------------------
// OpenCode Token Parser (DB step-finish)
// ---------------------------------------------------------------------------

describe("parseOpenCodeTokens", () => {
  test("extracts tokens from valid JSON", () => {
    const json = JSON.stringify({ input: 78, output: 47, reasoning: 10, cache: { read: 510, write: 11900 } });
    const result = parseOpenCodeTokens(json)!;
    expect(result.input).toBe(78);
    expect(result.output).toBe(47 + 10);
    expect(result.cache).toBe(510 + 11900);
  });

  test("handles missing reasoning", () => {
    const json = JSON.stringify({ input: 100, output: 50, cache: { read: 10, write: 5 } });
    const result = parseOpenCodeTokens(json)!;
    expect(result.output).toBe(50);
  });

  test("handles missing cache object", () => {
    const json = JSON.stringify({ input: 100, output: 50 });
    const result = parseOpenCodeTokens(json)!;
    expect(result.cache).toBe(0);
  });

  test("returns null for malformed JSON", () => {
    expect(parseOpenCodeTokens("{broken")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseOpenCodeTokens("")).toBeNull();
  });

  test("returns null for non-object JSON", () => {
    expect(parseOpenCodeTokens("42")).toBeNull();
    expect(parseOpenCodeTokens('"string"')).toBeNull();
    expect(parseOpenCodeTokens("null")).toBeNull();
  });

  test("rejects negative values", () => {
    const json = JSON.stringify({ input: -100, output: 50, cache: { read: -10, write: 5 } });
    const result = parseOpenCodeTokens(json)!;
    expect(result.input).toBe(0);
    expect(result.output).toBe(50);
    expect(result.cache).toBe(5);
  });

  test("rejects non-numeric values", () => {
    const json = JSON.stringify({ input: "inject", output: { hack: true }, cache: { read: [], write: null } });
    const result = parseOpenCodeTokens(json)!;
    expect(result.input).toBe(0);
    expect(result.output).toBe(0);
    expect(result.cache).toBe(0);
  });

  test("caps extremely large values", () => {
    const json = JSON.stringify({ input: 1e20, output: 0, cache: { read: 0, write: 0 } });
    const result = parseOpenCodeTokens(json)!;
    expect(result.input).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ---------------------------------------------------------------------------
// OpenCode Message Parser (GUI filesystem)
// ---------------------------------------------------------------------------

describe("parseOpenCodeMessage", () => {
  test("extracts tokens from valid assistant message", () => {
    const json = JSON.stringify({
      role: "assistant",
      time: { completed: 1772014624209 },
      tokens: { input: 88, output: 37, reasoning: 0, cache: { read: 12342, write: 6 } },
    });
    const result = parseOpenCodeMessage(json)!;
    expect(result.input).toBe(88);
    expect(result.output).toBe(37);
    expect(result.cache).toBe(12342 + 6);
    expect(result.completedAt).toBe(1772014624209);
  });

  test("returns null for user messages", () => {
    const json = JSON.stringify({ role: "user", time: { completed: 123 }, tokens: { input: 100 } });
    expect(parseOpenCodeMessage(json)).toBeNull();
  });

  test("returns null for assistant message without tokens", () => {
    const json = JSON.stringify({ role: "assistant", time: { completed: 123 } });
    expect(parseOpenCodeMessage(json)).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseOpenCodeMessage("not json")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseOpenCodeMessage("")).toBeNull();
  });

  test("defaults completedAt to 0 when missing", () => {
    const json = JSON.stringify({ role: "assistant", tokens: { input: 50, output: 25 } });
    const result = parseOpenCodeMessage(json)!;
    expect(result.completedAt).toBe(0);
    expect(result.input).toBe(50);
  });

  test("rejects negative token values", () => {
    const json = JSON.stringify({
      role: "assistant",
      time: { completed: 100 },
      tokens: { input: -999, output: 50, cache: { read: -1, write: 10 } },
    });
    const result = parseOpenCodeMessage(json)!;
    expect(result.input).toBe(0);
    expect(result.output).toBe(50);
    expect(result.cache).toBe(10);
  });

  test("rejects non-numeric token values", () => {
    const json = JSON.stringify({
      role: "assistant",
      time: { completed: 100 },
      tokens: { input: "a lot", output: true, cache: { read: {}, write: [] } },
    });
    const result = parseOpenCodeMessage(json)!;
    expect(result.input).toBe(0);
    expect(result.output).toBe(1); // true -> 1
    expect(result.cache).toBe(0);
  });

  test("returns null when tokens field is non-object", () => {
    const json = JSON.stringify({ role: "assistant", time: { completed: 100 }, tokens: 42 });
    expect(parseOpenCodeMessage(json)).toBeNull();
  });
});
